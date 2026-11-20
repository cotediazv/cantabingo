// La hora del sistema para todo lo que depende del día y la hora (horarios de los locales, salas automáticas,
// karaoke del jueves, pantallas). En las pruebas, KRB_FECHA (fecha ISO) fija desde qué momento corre el reloj,
// para simular cualquier día sin esperar a que llegue.
const START = Date.now();
const BASE = process.env.KRB_FECHA ? Date.parse(process.env.KRB_FECHA) : NaN;

const now = () => (Number.isNaN(BASE) ? Date.now() : BASE + (Date.now() - START));
const date = () => new Date(now());

module.exports = { now, date };
