<?php
declare(strict_types=1);

/**
 * O que o servidor sabe sobre cada tabela sincronizada: campos obrigatórios e chaves únicas.
 * Os dados chegam como JSON (camelCase, referências por uuid) e são guardados como vieram.
 */
final class Regras
{
    private const OBRIGATORIOS = [
        'usuarios' => ['nome', 'login', 'senhaHash', 'perfil'],
        'categorias' => ['nome'],
        'unidades' => ['sigla', 'nome'],
        'produtos' => ['codigo', 'nome', 'categoria', 'unidade'],
        'fornecedores' => ['razaoSocial', 'cnpj'],
        'clientes' => ['nome', 'tipo', 'documento'],
        'compras' => ['numero', 'fornecedor', 'data', 'status', 'itens'],
        'movimentacoes' => ['data', 'produto', 'tipo', 'quantidade', 'usuario'],
        'configuracoes' => ['nomeEmpresa'],
    ];

    public static function tabelaValida(string $tabela): bool
    {
        return array_key_exists($tabela, self::OBRIGATORIOS);
    }

    /** Retorna a mensagem de erro, ou null se os dados forem aceitáveis. */
    public static function validar(string $tabela, array $dados): ?string
    {
        foreach (self::OBRIGATORIOS[$tabela] as $campo) {
            if (!array_key_exists($campo, $dados) || $dados[$campo] === '' || $dados[$campo] === null) {
                return "Campo obrigatório ausente: $campo";
            }
        }
        if ($tabela === 'movimentacoes' && !in_array($dados['tipo'], ['entrada', 'saida', 'ajuste'], true)) {
            return 'Tipo de movimentação inválido';
        }
        if ($tabela === 'compras' && !in_array($dados['status'], ['rascunho', 'pedido', 'recebida', 'cancelada'], true)) {
            return 'Status de compra inválido';
        }
        return null;
    }

    /**
     * Valores que precisam ser únicos entre todos os terminais, já normalizados.
     * @return array<string, string> campo => valor
     */
    public static function chavesUnicas(string $tabela, array $d): array
    {
        $digitos = fn ($v) => preg_replace('/\D/', '', (string) $v);
        $minusculo = fn ($v) => mb_strtolower(trim((string) $v));
        $chaves = match ($tabela) {
            'usuarios' => ['login' => $minusculo($d['login'])],
            'categorias' => ['nome' => $minusculo($d['nome'])],
            'unidades' => ['sigla' => mb_strtoupper(trim((string) $d['sigla']))],
            'produtos' => ['codigo' => $minusculo($d['codigo'])] + (!empty($d['codigoBarras']) ? ['codigoBarras' => $digitos($d['codigoBarras'])] : []),
            'fornecedores' => ['cnpj' => $digitos($d['cnpj'])],
            'clientes' => ['documento' => $digitos($d['documento'])],
            'compras' => ['numero' => $minusculo($d['numero'])],
            // Cada item de compra só pode ser recebido uma vez, mesmo que dois terminais recebam a compra sem internet.
            'movimentacoes' => !empty($d['compra']) && $d['tipo'] === 'entrada' ? ['recebimento' => $d['compra'] . '|' . $d['produto']] : [],
            default => [],
        };
        return array_filter($chaves, fn ($v) => $v !== '');
    }

    public const NOMES_CAMPOS = [
        'login' => 'Login',
        'nome' => 'Nome',
        'sigla' => 'Sigla',
        'codigo' => 'Código',
        'codigoBarras' => 'Código de barras',
        'cnpj' => 'CNPJ',
        'documento' => 'CPF/CNPJ',
        'numero' => 'Número da compra',
        'recebimento' => 'Recebimento',
    ];
}
