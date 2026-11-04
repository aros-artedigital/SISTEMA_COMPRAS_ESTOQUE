<?php
declare(strict_types=1);

// API de sincronização do Gestor de Estoque e Compras. Veja README.md.

require __DIR__ . '/src/Banco.php';
require __DIR__ . '/src/Regras.php';
require __DIR__ . '/src/Sincronizacao.php';

const VERSAO_API = 1;

// No servidor embutido do PHP (testes), arquivos existentes (atualizações) são servidos direto.
if (PHP_SAPI === 'cli-server') {
    $arquivo = __DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (str_contains($arquivo, '/atualizacoes/') && is_file($arquivo)) {
        return false;
    }
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responder(int $status, array $corpo): never
{
    http_response_code($status);
    echo json_encode($corpo, JSON_UNESCAPED_UNICODE);
    exit;
}

function erro(int $status, string $mensagem): never
{
    responder($status, ['ok' => false, 'erro' => $mensagem]);
}

function corpoJson(): array
{
    $bruto = file_get_contents('php://input', false, null, 0, 20 * 1024 * 1024);
    $dados = json_decode($bruto ?: '', true);
    if (!is_array($dados)) erro(400, 'Corpo da requisição precisa ser JSON');
    return $dados;
}

/** Terminal dono do token, ou null. */
function dispositivo(PDO $pdo): ?array
{
    $cabecalho = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+([0-9a-f]{64})$/i', $cabecalho, $m)) return null;
    $stmt = $pdo->prepare('SELECT * FROM dispositivos WHERE token_hash = ?');
    $stmt->execute([hash('sha256', strtolower($m[1]))]);
    $d = $stmt->fetch();
    if (!$d) return null;
    $pdo->prepare('UPDATE dispositivos SET ultimo_acesso = ? WHERE id = ?')->execute([gmdate('Y-m-d H:i:s'), $d['id']]);
    return $d;
}

function exigirDispositivo(PDO $pdo): array
{
    return dispositivo($pdo) ?? erro(401, 'Terminal não autorizado. Conecte-o novamente nas configurações.');
}

function uuid4(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

try {
    $cfg = Banco::configuracao();
    $pdo = Banco::conectar($cfg);

    // Rota relativa à pasta da API (funciona em subpastas como /estoque-api/).
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
    $caminho = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
    if ($base !== '' && str_starts_with($caminho, $base)) $caminho = substr($caminho, strlen($base));
    $caminho = '/' . trim(preg_replace('#^/index\.php#', '', $caminho), '/');
    $metodo = $_SERVER['REQUEST_METHOD'];

    if ($metodo === 'GET' && ($caminho === '/' || $caminho === '/status')) {
        $resposta = ['ok' => true, 'versaoApi' => VERSAO_API, 'horaServidor' => gmdate('c')];
        if ($d = dispositivo($pdo)) {
            $resposta['terminal'] = ['nome' => $d['nome'], 'codigo' => $d['codigo']];
            $resposta['registros'] = (int) $pdo->query('SELECT COUNT(*) FROM registros WHERE excluido = 0')->fetchColumn();
        }
        responder(200, $resposta);
    }

    if ($metodo === 'POST' && $caminho === '/dispositivos') {
        $c = corpoJson();
        if (!hash_equals((string) $cfg['chave_cadastro'], (string) ($c['chave'] ?? ''))) {
            usleep(500_000); // atrasa tentativas de adivinhar a chave
            erro(403, 'Chave de cadastro incorreta.');
        }
        $nome = trim((string) ($c['nome'] ?? ''));
        $codigo = strtoupper(trim((string) ($c['codigo'] ?? '')));
        if ($nome === '' || mb_strlen($nome) > 100) erro(422, 'Informe o nome do terminal.');
        if (!preg_match('/^[A-Z0-9]{1,6}$/', $codigo)) erro(422, 'O código do terminal deve ter de 1 a 6 letras ou números.');
        $existe = $pdo->prepare('SELECT 1 FROM dispositivos WHERE codigo = ?');
        $existe->execute([$codigo]);
        if ($existe->fetchColumn()) erro(409, "O código \"$codigo\" já está em uso por outro terminal.");

        $token = bin2hex(random_bytes(32));
        $uuid = uuid4();
        $pdo->prepare('INSERT INTO dispositivos (uuid, nome, codigo, token_hash, criado_em) VALUES (?, ?, ?, ?, ?)')
            ->execute([$uuid, $nome, $codigo, hash('sha256', $token), gmdate('Y-m-d H:i:s')]);
        $registros = (int) $pdo->query('SELECT COUNT(*) FROM registros WHERE excluido = 0')->fetchColumn();
        responder(201, ['ok' => true, 'uuid' => $uuid, 'token' => $token, 'nome' => $nome, 'codigo' => $codigo, 'registros' => $registros]);
    }

    if ($metodo === 'POST' && $caminho === '/sync/enviar') {
        $d = exigirDispositivo($pdo);
        $alteracoes = corpoJson()['alteracoes'] ?? null;
        if (!is_array($alteracoes) || count($alteracoes) > 1000) erro(400, 'Envie até 1000 alterações por vez.');
        $sync = new Sincronizacao($pdo, (int) $d['id']);
        responder(200, ['ok' => true, 'resultados' => $sync->enviar($alteracoes)]);
    }

    if ($metodo === 'GET' && $caminho === '/sync/receber') {
        $d = exigirDispositivo($pdo);
        $desde = max(0, (int) ($_GET['desde'] ?? 0));
        $limite = min(1000, max(1, (int) ($_GET['limite'] ?? 500)));
        $sync = new Sincronizacao($pdo, (int) $d['id']);
        responder(200, ['ok' => true] + $sync->receber($desde, $limite));
    }

    erro(404, 'Rota não encontrada.');
} catch (Throwable $e) {
    error_log('[estoque-api] ' . $e);
    erro(500, 'Erro interno no servidor.');
}
