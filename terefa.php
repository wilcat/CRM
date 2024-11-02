<?php
class Tarefa {
    private $conn;
    private $table_name = "tarefas";

    public $id;
    public $cliente_id;
    public $titulo;
    public $descricao;
    public $data_vencimento;
    public $status;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function create() {
        $query = "INSERT INTO " . $this->table_name . " SET cliente_id=:cliente_id, titulo=:titulo, descricao=:descricao, data_vencimento=:data_vencimento";
        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(":cliente_id", $this->cliente_id);
        $stmt->bindParam(":titulo", $this->titulo);
        $stmt->bindParam(":descricao", $this->descricao);
        $stmt->bindParam(":data_vencimento", $this->data_vencimento);

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
        $query = "UPDATE " . $this->table_name . " SET titulo=:titulo, descricao=:descricao, data_vencimento=:data_vencimento, status=:status WHERE id=:id";
        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(":titulo", $this->titulo);
        $stmt->bindParam(":descricao", $this->descricao);
        $stmt->bindParam(":data_vencimento", $this->data_vencimento);
        $stmt->bindParam(":status", $this->status);
        $stmt->bindParam(":id", $this->id);

        return $stmt->execute();
    }

    public function delete() {
        $query = "DELETE FROM " . $this->table_name . " WHERE id=:id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(":id", $this->id);
        return $stmt->execute();
    }
}
?>
