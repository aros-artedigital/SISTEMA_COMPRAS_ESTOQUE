<?php
declare(strict_types=1);

/** Aplica as alterações enviadas pelos terminais e devolve as alterações dos outros. */
final class Sincronizacao
{
    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^(configuracoes|recuperacao)$/';
    private const DATA = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/';

    public function __construct(private PDO $pdo, private int $dispositivoId)
    {
    }

    /**
     * @param array<int, array<string, mixed>> $alteracoes
     * @return array<int, array<string, string>>
     */
    public function enviar(array $alteracoes): array
    {
        $resultados = [];
        foreach ($alteracoes as $a) {
            $tabela = (string) ($a['tabela'] ?? '');
            $uuid = (string) ($a['uuid'] ?? '');
            try {
                $this->pdo->beginTransaction();
                [$status, $motivo] = $this->aplicar($a);
                $this->pdo->commit();
            } catch (PDOException $e) {
                $this->pdo->rollBack();
                // Corrida entre dois terminais gravando a mesma chave única ao mesmo tempo.
                if ($e->getCode() === '23000' || str_contains($e->getMessage(), 'UNIQUE')) {
                    [$status, $motivo] = ['rejeitado', 'Valor já usado em outro registro (tente sincronizar de novo).'];
                } else {
                    throw $e;
                }
            }
            $resultados[] = ['tabela' => $tabela, 'uuid' => $uuid, 'status' => $status] + ($motivo ? ['motivo' => $motivo] : []);
        }
        return $resultados;
    }

    /** @return array{0: string, 1: ?string} */
    private function aplicar(array $a): array
    {
        $tabela = (string) ($a['tabela'] ?? '');
        $uuid = (string) ($a['uuid'] ?? '');
        $operacao = (string) ($a['operacao'] ?? '');
        $alteradoEm = (string) ($a['alteradoEm'] ?? '');
        $dados = $a['dados'] ?? null;

        if (!Regras::tabelaValida($tabela)) return ['rejeitado', 'Tabela desconhecida'];
        if (!preg_match(self::UUID, $uuid)) return ['rejeitado', 'Identificador inválido'];
        if (!in_array($operacao, ['salvar', 'excluir'], true)) return ['rejeitado', 'Operação inválida'];
        if (!preg_match(self::DATA, $alteradoEm)) return ['rejeitado', 'Data de alteração inválida'];
        if ($operacao === 'salvar') {
            if (!is_array($dados)) return ['rejeitado', 'Dados ausentes'];
            if (strlen(json_encode($dados)) > 256 * 1024) return ['rejeitado', 'Registro grande demais'];
            if ($erro = Regras::validar($tabela, $dados)) return ['rejeitado', $erro];
        }

        $atual = $this->buscar($tabela, $uuid);

        if ($tabela === 'movimentacoes') {
            // Movimentações são imutáveis: reenviar a mesma é inofensivo; editar ou excluir, não.
            if ($operacao === 'excluir') return ['rejeitado', 'Movimentações não podem ser excluídas'];
            if ($atual) return ['ignorado', 'Já recebida'];
        }

        if ($atual) {
            if ($atual['alterado_em'] === $alteradoEm && (int) $atual['dispositivo_id'] === $this->dispositivoId) {
                return ['aceito', null]; // reenvio após falha de rede
            }
            if (strcmp($atual['alterado_em'], $alteradoEm) > 0) {
                return ['ignorado', 'O servidor tem uma versão mais recente'];
            }
            if ($tabela === 'compras' && !$atual['excluido']) {
                $antes = json_decode($atual['dados'], true);
                if (($antes['status'] ?? '') === 'recebida' && ($operacao === 'excluir' || $dados['status'] !== 'recebida')) {
                    return ['rejeitado', 'Esta compra já foi recebida em outro terminal'];
                }
            }
        } elseif ($operacao === 'excluir') {
            return ['ignorado', 'Registro não existe no servidor'];
        }

        $chaves = $operacao === 'salvar' ? Regras::chavesUnicas($tabela, $dados) : [];
        foreach ($chaves as $campo => $valor) {
            $dono = $this->consultarUm('SELECT uuid FROM chaves_unicas WHERE tabela = ? AND campo = ? AND valor = ?', [$tabela, $campo, $valor]);
            if ($dono !== null && $dono !== $uuid) {
                $nome = Regras::NOMES_CAMPOS[$campo] ?? $campo;
                return $campo === 'recebimento'
                    ? ['rejeitado', 'Este item da compra já foi recebido em outro terminal']
                    : ['rejeitado', "$nome \"" . ($dados[$campo] ?? $valor) . "\" já está em uso em outro registro"];
            }
        }

        $json = $operacao === 'salvar' ? json_encode($dados, JSON_UNESCAPED_UNICODE) : null;
        $agora = gmdate('Y-m-d H:i:s');
        $this->executar(
            'INSERT INTO alteracoes (tabela, uuid, operacao, dados, alterado_em, dispositivo_id, recebido_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$tabela, $uuid, $operacao, $json, $alteradoEm, $this->dispositivoId, $agora]
        );
        $seq = (int) $this->pdo->lastInsertId();

        $excluido = $operacao === 'excluir' ? 1 : 0;
        if ($atual) {
            $this->executar(
                'UPDATE registros SET dados = ?, alterado_em = ?, excluido = ?, dispositivo_id = ?, seq = ? WHERE tabela = ? AND uuid = ?',
                [$json ?? $atual['dados'], $alteradoEm, $excluido, $this->dispositivoId, $seq, $tabela, $uuid]
            );
        } else {
            $this->executar(
                'INSERT INTO registros (tabela, uuid, dados, alterado_em, excluido, dispositivo_id, seq) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$tabela, $uuid, $json, $alteradoEm, $excluido, $this->dispositivoId, $seq]
            );
        }

        $this->executar('DELETE FROM chaves_unicas WHERE tabela = ? AND uuid = ?', [$tabela, $uuid]);
        foreach ($chaves as $campo => $valor) {
            $this->executar('INSERT INTO chaves_unicas (tabela, campo, valor, uuid) VALUES (?, ?, ?, ?)', [$tabela, $campo, $valor, $uuid]);
        }
        return ['aceito', null];
    }

    /** Alterações feitas por outros terminais depois do cursor `desde`. */
    public function receber(int $desde, int $limite): array
    {
        $stmt = $this->pdo->prepare('SELECT seq, tabela, uuid, operacao, dados, alterado_em, dispositivo_id FROM alteracoes WHERE seq > ? ORDER BY seq LIMIT ' . $limite);
        $stmt->execute([$desde]);
        $linhas = $stmt->fetchAll();

        $alteracoes = [];
        foreach ($linhas as $l) {
            if ((int) $l['dispositivo_id'] === $this->dispositivoId) continue; // o próprio terminal já tem
            $alteracoes[] = [
                'seq' => (int) $l['seq'],
                'tabela' => $l['tabela'],
                'uuid' => $l['uuid'],
                'operacao' => $l['operacao'],
                'dados' => $l['dados'] !== null ? json_decode($l['dados'], true) : null,
                'alteradoEm' => $l['alterado_em'],
            ];
        }
        $ultimo = $linhas ? (int) end($linhas)['seq'] : $desde;
        return ['alteracoes' => $alteracoes, 'ultimoSeq' => $ultimo, 'temMais' => count($linhas) === $limite];
    }

    private function buscar(string $tabela, string $uuid): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM registros WHERE tabela = ? AND uuid = ?');
        $stmt->execute([$tabela, $uuid]);
        return $stmt->fetch() ?: null;
    }

    private function consultarUm(string $sql, array $params): ?string
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $v = $stmt->fetchColumn();
        return $v === false ? null : (string) $v;
    }

    private function executar(string $sql, array $params): void
    {
        $this->pdo->prepare($sql)->execute($params);
    }
}
