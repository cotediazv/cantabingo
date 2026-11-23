// Aviso inmediato a las pantallas (pedido de Cote, 22 nov: que el GC y los efectos respondan fluido). Las pantallas (GC de
// OBS, tableros, pantallas de los locales y la capa gráfica) preguntan cada 1 a 3 segundos qué mostrar; además quedan
// escuchando aquí y, cuando cambia el escenario, el GC de una sala light o se dispara un efecto, vuelven a preguntar al
// instante. Si esta conexión falla, siguen preguntando cada pocos segundos como siempre.
module.exports = function aviso({ app }) {
  const clients = new Set();
  app.get('/api/live', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('data: hola\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  });
  return () => { for (const res of clients) res.write('data: cambio\n\n'); };
};
