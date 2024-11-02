<?php
include_once 'Database.php';
include_once 'Relatorio.php';

$database = new Database();
$db = $database->getConnection();
$relatorio = new Relatorio($db);

echo "1. Relatório de Clientes por Status\n";
$clientesStatus = $relatorio->clientesPorStatus();
while ($row = $clientesStatus->fetch(PDO::FETCH_ASSOC)) {
    echo "Status: " . $row['status'] . " - Total: " . $row['total'] . "\n";
}

echo "\n2. Relatório de Tarefas por Status\n";
$tarefasStatus = $relatorio->tarefasPorStatus();
while ($row = $tarefasStatus->fetch(PDO::FETCH_ASSOC)) {
    echo "Status: " . $row['status'] . " - Total: " . $row['total'] . "\n";
}

echo "\n3. Relatório de Oportunidades por Etapa\n";
$etapasPipeline = $relatorio->oportunidadesPorEtapa();
while ($row = $etapasPipeline->fetch(PDO::FETCH_ASSOC)) {
    echo "Etapa: " . $row['etapa'] . " - Total: " . $row['total'] . "\n";
}
?>
