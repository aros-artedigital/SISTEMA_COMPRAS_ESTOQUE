<?php
// Copie este arquivo para config.php e preencha. O config.php nunca deve ir para o git.
return [
    // MySQL/MariaDB da hospedagem
    'dsn' => 'mysql:host=localhost;dbname=estoque_sync;charset=utf8mb4',
    'usuario' => 'estoque',
    'senha' => 'troque-esta-senha',

    // Chave usada para cadastrar novos terminais. Use algo longo e difícil de adivinhar.
    'chave_cadastro' => 'troque-por-uma-chave-longa',
];
