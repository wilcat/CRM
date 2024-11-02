<?php
include_once 'Database.php';
include_once 'Tarefa.php';

$database = new Database();
$db = $database->getConnection();
$tarefa = new Tarefa($db);

echo "1. Teste de Criação de Tarefa\n";
$tarefa->cliente_id = 1;  // Altere para o ID de um cliente existente
$tarefa->titulo = "Agendar reunião";
$tarefa->descricao = "Marcar reunião para discutir propostas";
$tarefa->data_vencimento = "2024-11-10";

if ($tarefa->create()) {
    echo "Tarefa criada com sucesso.\n";
} else {
    echo "Erro ao criar tarefa.\n";
}

echo "2. Teste de Leitura de Tarefas\n";
$tarefa->cliente_id = 1;  // Altere para o ID do cliente que deseja ver as tarefas
$result = $tarefa->read();
while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
    echo "Tarefa: " . $row['titulo'] . " - " . $row['descricao'] . " (Status: " . $row['status'] . ")\n";
}

echo "3. Teste de Atualização de Tarefa\n";
$tarefa->id = 1;  // Altere para o ID de uma tarefa existente
$tarefa->titulo = "Agendar reunião de revisão";
$tarefa->descricao = "Reunião para discutir feedbacks";
$tarefa->data_vencimento = "2024-11-15";
$tarefa->status = "Em Andamento";

if ($tarefa->update()) {
    echo "Tarefa atualizada com sucesso.\n";
} else {
    echo "Erro ao atualizar tarefa.\n";
}
?>
