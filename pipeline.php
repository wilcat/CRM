<?php
class Pipeline {
    private $conn;
    private $table_name = "pipeline_vendas";

    public $id;
    public $cliente_id;
    public $etapa;
    public $data_entrada;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function create() {
        $query = "INSERT INTO " . $this->table_name . " SET cliente_id=:cliente_id, etapa=:etapa";
        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(":cliente_id", $this->cliente_id);
        $stmt->bindParam(":etapa", $this->etapa);

        return $stmt->execute();
    }

    public function read() {
        $query = "SELECT * FROM " . $this->table_name . " WHERE cliente_id = :cliente_id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(":cliente_id", $this->cliente_id);
        $stmt->execute();
        return $stmt;
    }

    public function update() {
        $query = "UPDATE " . $this->table_name . " SET etapa=:etapa WHERE cliente_id=:cliente_id";
        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(":etapa", $this->etapa);
        $stmt->bindParam(":cliente_id", $this->cliente_id);

        return $stmt->execute();
    }
}
?>
