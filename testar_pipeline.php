<?php
include_once 'Database.php';
include_once 'Pipeline.php';

$database = new Database();
$db = $database->getConnection();
$pipeline = new Pipeline($db);

echo "1. Teste de Adição ao Pipeline\n";
$pipeline->cliente_id = 1;  // Altere para o ID de um cliente existente
$pipeline->etapa = "Prospecção";

if ($pipeline->create()) {
    echo "Cliente adicionado ao pipeline com sucesso.\n";
} else {
    echo "Erro ao adicionar cliente ao pipeline.\n";
}

echo "2. Teste de Leitura do Pipeline\n";
$pipeline->cliente_id = 1;  // Altere para o ID do cliente que deseja ver a etapa
$result = $pipeline->read();
while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
    echo "Etapa: " . $row['etapa'] . " - Data de Entrada: " . $row['data_entrada'] . "\n";
}

echo "3. Teste de Atualização de Etapa do Pipeline\n";
$pipeline->cliente_id = 1;  // Altere para o ID de um cliente existente
$pipeline->etapa = "Negociação";

if ($pipeline->update()) {
    echo "Etapa do pipeline atualizada com sucesso.\n";
} else {
    echo "Erro ao atualizar etapa do pipeline.\n";
}
?>
