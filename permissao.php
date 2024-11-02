<?php
class Permissao {
    private $conn;
    private $table_name = "permissoes";

    public function __construct($db) {
        $this->conn = $db;
    }

    public function verificarPermissao($papel, $recurso, $acao) {
        $query = "SELECT permitido FROM " . $this->table_name . " WHERE papel = :papel AND recurso = :recurso AND acao = :acao";
        $stmt = $this->conn->prepare($query);

        $stmt->bindParam(":papel", $papel);
        $stmt->bindParam(":recurso", $recurso);
        $stmt->bindParam(":acao", $acao);
        $stmt->execute();

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row && $row['permitido'];
    }
}
?>
