<?php
require('fpdf/fpdf.php');

$pdf = new FPDF();
$pdf->AddPage();
$pdf->SetFont('Arial', 'B', 12);

// Cabeçalho do relatório
$pdf->Cell(40, 10, 'Relatorio de Clientes por Status');
$pdf->Ln();

// Dados de exemplo
$relatorio = new Relatorio($db);
$clientesStatus = $relatorio->clientesPorStatus();
while ($row = $clientesStatus->fetch(PDO::FETCH_ASSOC)) {
    $pdf->Cell(40, 10, 'Status: ' . $row['status'] . ' - Total: ' . $row['total']);
    $pdf->Ln();
}

$pdf->Output();
?>
