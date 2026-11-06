<?php
declare(strict_types=1);

/** Conexão PDO e criação do esquema (MySQL/MariaDB em produção, SQLite nos testes locais). */
final class Banco
{
    public static function configuracao(): array
    {
        $arquivo = __DIR__ . '/../config.php';
        if (is_file($arquivo)) {
            return require $arquivo;
        }
        return [
            'dsn' => getenv('ESTOQUE_DB_DSN') ?: 'sqlite:' . __DIR__ . '/../dados/servidor.sqlite',
            'usuario' => getenv('ESTOQUE_DB_USUARIO') ?: null,
            'senha' => getenv('ESTOQUE_DB_SENHA') ?: null,
            'chave_cadastro' => getenv('ESTOQUE_CHAVE_CADASTRO') ?: 'teste-local',
        ];
    }

    public static function conectar(array $cfg): PDO
    {
        if (str_starts_with($cfg['dsn'], 'sqlite:')) {
            $arquivo = substr($cfg['dsn'], 7);
            if (!is_dir(dirname($arquivo))) {
                mkdir(dirname($arquivo), 0770, true);
            }
        }
        $pdo = new PDO($cfg['dsn'], $cfg['usuario'] ?? null, $cfg['senha'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        if (self::ehSqlite($pdo)) {
            $pdo->exec('PRAGMA journal_mode = WAL');
            $pdo->exec('PRAGMA busy_timeout = 5000');
        }
        self::criarEsquema($pdo);
        return $pdo;
    }

    public static function ehSqlite(PDO $pdo): bool
    {
        return $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
    }

    private static function criarEsquema(PDO $pdo): void
    {
        if (self::ehSqlite($pdo)) {
            $pdo->exec(<<<SQL
                CREATE TABLE IF NOT EXISTS dispositivos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT NOT NULL UNIQUE,
                    nome TEXT NOT NULL,
                    codigo TEXT NOT NULL UNIQUE,
                    token_hash TEXT NOT NULL UNIQUE,
                    criado_em TEXT NOT NULL,
                    ultimo_acesso TEXT
                );
                CREATE TABLE IF NOT EXISTS registros (
                    tabela TEXT NOT NULL,
                    uuid TEXT NOT NULL,
                    dados TEXT NOT NULL,
                    alterado_em TEXT NOT NULL,
                    excluido INTEGER NOT NULL DEFAULT 0,
                    dispositivo_id INTEGER NOT NULL,
                    seq INTEGER NOT NULL,
                    PRIMARY KEY (tabela, uuid)
                );
                CREATE TABLE IF NOT EXISTS alteracoes (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    tabela TEXT NOT NULL,
                    uuid TEXT NOT NULL,
                    operacao TEXT NOT NULL,
                    dados TEXT,
                    alterado_em TEXT NOT NULL,
                    dispositivo_id INTEGER NOT NULL,
                    recebido_em TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS chaves_unicas (
                    tabela TEXT NOT NULL,
                    campo TEXT NOT NULL,
                    valor TEXT NOT NULL,
                    uuid TEXT NOT NULL,
                    PRIMARY KEY (tabela, campo, valor)
                );
                CREATE INDEX IF NOT EXISTS idx_chaves_uuid ON chaves_unicas (tabela, uuid);
                CREATE TABLE IF NOT EXISTS recebimentos (
                    compra TEXT NOT NULL,
                    produto TEXT NOT NULL,
                    quantidade INTEGER NOT NULL,
                    PRIMARY KEY (compra, produto)
                );
                SQL);
            return;
        }

        $opcoes = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
        $pdo->exec("CREATE TABLE IF NOT EXISTS dispositivos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uuid CHAR(36) NOT NULL UNIQUE,
            nome VARCHAR(100) NOT NULL,
            codigo VARCHAR(10) NOT NULL UNIQUE,
            token_hash CHAR(64) NOT NULL UNIQUE,
            criado_em DATETIME NOT NULL,
            ultimo_acesso DATETIME NULL
        ) $opcoes");
        $pdo->exec("CREATE TABLE IF NOT EXISTS registros (
            tabela VARCHAR(32) NOT NULL,
            uuid CHAR(36) NOT NULL,
            dados MEDIUMTEXT NOT NULL,
            alterado_em VARCHAR(30) NOT NULL,
            excluido TINYINT NOT NULL DEFAULT 0,
            dispositivo_id INT NOT NULL,
            seq BIGINT NOT NULL,
            PRIMARY KEY (tabela, uuid)
        ) $opcoes");
        $pdo->exec("CREATE TABLE IF NOT EXISTS alteracoes (
            seq BIGINT AUTO_INCREMENT PRIMARY KEY,
            tabela VARCHAR(32) NOT NULL,
            uuid CHAR(36) NOT NULL,
            operacao VARCHAR(10) NOT NULL,
            dados MEDIUMTEXT NULL,
            alterado_em VARCHAR(30) NOT NULL,
            dispositivo_id INT NOT NULL,
            recebido_em DATETIME NOT NULL
        ) $opcoes");
        $pdo->exec("CREATE TABLE IF NOT EXISTS chaves_unicas (
            tabela VARCHAR(32) NOT NULL,
            campo VARCHAR(32) NOT NULL,
            valor VARCHAR(190) NOT NULL,
            uuid CHAR(36) NOT NULL,
            PRIMARY KEY (tabela, campo, valor),
            INDEX idx_chaves_uuid (tabela, uuid)
        ) $opcoes");
        // Quanto já entrou de cada item de compra, somando todos os terminais (recebimento parcial).
        $pdo->exec("CREATE TABLE IF NOT EXISTS recebimentos (
            compra CHAR(36) NOT NULL,
            produto CHAR(36) NOT NULL,
            quantidade INT NOT NULL,
            PRIMARY KEY (compra, produto)
        ) $opcoes");
    }
}
