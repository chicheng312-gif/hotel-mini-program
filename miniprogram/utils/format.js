function fenToYuan(fen) {
  const n = Number(fen);
  if (Number.isNaN(n)) return "0.00";
  return (n / 100).toFixed(2);
}

function yuanToFen(yuan) {
  return Math.round(Number(yuan) * 100);
}

function formatDate(ts) {
  const d = new Date(ts);
  const p = (x) => (x < 10 ? "0" + x : "" + x);
  return (
    d.getFullYear() +
    "-" +
    p(d.getMonth() + 1) +
    "-" +
    p(d.getDate()) +
    " " +
    p(d.getHours()) +
    ":" +
    p(d.getMinutes())
  );
}

module.exports = { fenToYuan, yuanToFen, formatDate };
