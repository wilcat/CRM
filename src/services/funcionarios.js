// src/services/funcionarios.js
// Regras de calculo para funcionarios (contracheque).

// Calcula os dados de referencia pra montar o contracheque de um mes
// (formato "YYYY-MM"): desconto de INSS estimado (tabela progressiva 2024)
// e soma dos vales registrados naquele mes. O valor de INSS e so uma
// SUGESTAO — fica editavel na tela antes de imprimir, e vale confirmar com
// o contador da empresa (a tabela e revisada todo ano).
function calcularINSS(salario) {
  const faixas = [
    { limite: 1412.00, aliquota: 0.075 },
    { limite: 2666.68, aliquota: 0.09 },
    { limite: 4000.03, aliquota: 0.12 },
    { limite: 7786.02, aliquota: 0.14 },
  ];
  let inss = 0;
  let anterior = 0;
  for (const faixa of faixas) {
    if (salario > anterior) {
      const baseFaixa = Math.min(salario, faixa.limite) - anterior;
      inss += baseFaixa * faixa.aliquota;
      anterior = faixa.limite;
    }
  }
  return Math.round(inss * 100) / 100;
}

module.exports = { calcularINSS };
