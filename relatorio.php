<?php
class Relatorio {
    private $conn;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function clientesPorStatus() {
        $query = "SELECT status, COUNT(*) as total FROM clientes GROUP BY status";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    public function tarefasPorStatus() {
        $query = "SELECT status, COUNT(*) as total FROM tarefas GROUP BY status";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    public function oportunidadesPorEtapa() {
        $query = "SELECT etapa, COUNT(*) as total FROM pipeline_vendas GROUP BY etapa";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }
}
?>
