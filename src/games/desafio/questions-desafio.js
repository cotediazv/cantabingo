// Banco de preguntas de «El Gran Desafío».
// Formato por línea:  nivel | categoría | pregunta | respuesta correcta | incorrecta | incorrecta | incorrecta
//   nivel: f = fácil (escalones 1 a 3), m = medio (4 a 7), d = difícil (8 a 10)
//   categoría: g = cultura general, m = música, a = arte
// Las alternativas se barajan solas al repartir la pregunta. Para ampliar el banco basta con agregar líneas.
const RAW = `
f|g|¿Cuál es la capital de Chile?|Santiago|Valparaíso|Concepción|La Serena
f|g|¿Cuántos días tiene una semana?|7|5|6|8
f|g|¿Qué animal es conocido como «el rey de la selva»?|León|Tigre|Elefante|Gorila
f|g|¿Cuántas patas tiene una araña?|8|6|10|4
f|g|¿Cuántos meses tiene un año?|12|10|11|13
f|g|¿Cuál es el baile nacional de Chile?|La cueca|El tango|La salsa|La cumbia
f|g|¿En qué mes se celebran las Fiestas Patrias en Chile?|Septiembre|Octubre|Julio|Diciembre
f|g|¿Qué se celebra el 25 de diciembre?|Navidad|Año Nuevo|Halloween|Día del Trabajo
f|g|¿Qué océano baña las costas de Chile?|Pacífico|Atlántico|Índico|Ártico
f|g|¿Qué ave de granja pone los huevos que comemos a diario?|Gallina|Pato|Avestruz|Paloma
f|g|¿Cuántos colores tiene el arcoíris?|7|5|6|9
f|m|¿Qué instrumento tiene teclas blancas y negras?|Piano|Guitarra|Violín|Trompeta
f|m|¿Cuántas cuerdas tiene una guitarra común?|6|4|5|8
f|g|¿Cuánto es 7 por 8?|56|54|48|64
f|g|¿Con qué parte del cuerpo olemos?|Nariz|Oreja|Boca|Ojos
f|g|¿Cuál es el animal terrestre más grande?|Elefante|Jirafa|Rinoceronte|Hipopótamo
f|g|¿Qué estación del año viene después del invierno?|Primavera|Verano|Otoño|Ninguna
f|g|¿Qué comida chilena es una masa rellena de pino, horneada?|Empanada|Sopaipilla|Completo|Humita
f|g|¿Cómo se llama el completo con tomate, palta y mayonesa?|Italiano|Chacarero|Dinámico|Alemán
f|g|¿Cuántas horas tiene un día?|24|12|20|48
f|g|¿Qué superhéroe se viste de murciélago?|Batman|Superman|Spider-Man|Iron Man
f|g|¿En qué deporte se usa una raqueta y una pelota amarilla pequeña?|Tenis|Fútbol|Básquetbol|Vóleibol
f|a|¿Qué colores se mezclan para obtener el verde?|Azul y amarillo|Rojo y blanco|Rojo y azul|Negro y blanco
f|g|¿Cuál es el satélite natural de la Tierra?|La Luna|El Sol|Marte|Plutón
f|g|¿Qué animal es famoso por su caparazón y su lentitud?|Tortuga|Conejo|Ardilla|Liebre
f|m|¿Qué canción se canta en los cumpleaños?|Cumpleaños feliz|Los pollitos dicen|Arroz con leche|Estrellita
f|g|¿Cuántos jugadores tiene un equipo de fútbol en la cancha?|11|9|10|12
f|g|¿Qué país tiene forma de bota?|Italia|España|Grecia|Portugal
f|g|¿Cuál es la moneda de Chile?|Peso|Dólar|Euro|Sol
f|g|¿Qué animal aparece junto al cóndor en el escudo de Chile?|Huemul|Puma|Pudú|Guanaco
f|a|¿Qué famoso personaje de Disney es un ratón?|Mickey|Donald|Goofy|Pluto
f|g|¿Qué ciudad chilena es famosa por sus ascensores y cerros?|Valparaíso|Temuco|Antofagasta|Rancagua
f|g|¿Cuál es el mamífero que puede volar?|Murciélago|Ardilla|Gato|Conejo
f|g|¿Qué órgano bombea la sangre por el cuerpo?|Corazón|Pulmón|Hígado|Riñón
f|g|¿Cuál es la capital de Argentina?|Buenos Aires|Córdoba|Rosario|Mendoza
f|g|¿De qué color es una esmeralda?|Verde|Roja|Azul|Morada
f|g|¿Qué planeta es conocido como «el planeta rojo»?|Marte|Venus|Mercurio|Júpiter
f|m|¿Qué instrumento se toca con baquetas?|Batería|Flauta|Arpa|Guitarra
f|g|¿Cuántos lados tiene un triángulo?|3|4|5|6
f|g|¿En qué continente está Chile?|América|Europa|Asia|Oceanía
m|m|¿Quién compuso la canción «Gracias a la vida»?|Violeta Parra|Víctor Jara|Mercedes Sosa|Los Jaivas
m|g|¿Cuál es la montaña más alta del mundo?|Everest|Aconcagua|K2|Kilimanjaro
m|g|¿Cuál es la montaña más alta de América?|Aconcagua|Ojos del Salado|Chimborazo|Huascarán
m|g|¿En qué año llegó el ser humano a la Luna?|1969|1959|1972|1965
m|g|¿Qué poeta chilena ganó el Premio Nobel de Literatura en 1945?|Gabriela Mistral|Violeta Parra|Isabel Allende|Marcela Paz
m|g|¿Quién escribió «Veinte poemas de amor y una canción desesperada»?|Pablo Neruda|Nicanor Parra|Vicente Huidobro|Gonzalo Rojas
m|g|¿Cuántos huesos tiene el cuerpo humano adulto?|206|180|250|312
m|g|¿Cuál es la fórmula química del agua?|H2O|CO2|O2|NaCl
m|g|¿En qué continente está Egipto?|África|Asia|Europa|Oceanía
m|g|¿Cuál es la capital de Perú?|Lima|Cusco|Arequipa|Trujillo
m|m|¿De qué país es el grupo ABBA?|Suecia|Noruega|Dinamarca|Inglaterra
m|m|¿Cómo se llamaba el cantante principal de Queen?|Freddie Mercury|Mick Jagger|Elton John|David Bowie
m|m|¿Qué cantante es conocido como «el Rey del Pop»?|Michael Jackson|Elvis Presley|Prince|Freddie Mercury
m|m|¿Qué cantante es conocido como «el Rey del Rock and Roll»?|Elvis Presley|Chuck Berry|Little Richard|Michael Jackson
m|m|¿Qué banda chilena canta «El baile de los que sobran»?|Los Prisioneros|Los Bunkers|Los Jaivas|Chancho en Piedra
m|m|¿Qué cantante colombiana canta «Hips Don't Lie»?|Shakira|Karol G|Thalía|Jennifer Lopez
m|m|¿En qué ciudad chilena se realiza el festival de música de la Quinta Vergara?|Viña del Mar|Valparaíso|La Serena|Santiago
m|m|¿Cómo se llama el premio más famoso del Festival de Viña del Mar?|Gaviota de Plata|Cóndor de Oro|Estrella de Plata|Copihue de Oro
m|a|¿Quién pintó la «Mona Lisa»?|Leonardo da Vinci|Miguel Ángel|Rafael|Pablo Picasso
m|a|¿Qué pintor holandés se cortó parte de una oreja?|Vincent van Gogh|Rembrandt|Vermeer|Rubens
m|a|¿Quién pintó «La noche estrellada»?|Vincent van Gogh|Claude Monet|Salvador Dalí|Pablo Picasso
m|a|¿Qué pintora mexicana es famosa por sus autorretratos con las cejas unidas?|Frida Kahlo|Remedios Varo|Leonora Carrington|María Izquierdo
m|g|¿Cuál es el planeta más grande del sistema solar?|Júpiter|Saturno|Neptuno|Urano
m|g|¿Qué gas necesitamos respirar para vivir?|Oxígeno|Nitrógeno|Hidrógeno|Helio
m|g|¿Cómo se llama la isla chilena famosa por los moáis?|Isla de Pascua|Chiloé|Juan Fernández|Isla Mocha
m|g|¿Cuántos lados tiene un hexágono?|6|5|7|8
m|g|¿En qué año comenzó la Primera Guerra Mundial?|1914|1918|1939|1905
m|g|¿Qué país le regaló a Estados Unidos la Estatua de la Libertad?|Francia|Inglaterra|España|Italia
m|g|¿Cuál es el idioma oficial de Brasil?|Portugués|Español|Inglés|Francés
m|g|¿Qué selección ganó la Copa América en 2015 y en 2016?|Chile|Argentina|Uruguay|Brasil
m|g|¿Qué tenista chileno ganó dos medallas de oro en Atenas 2004?|Nicolás Massú|Marcelo Ríos|Fernando González|Nicolás Jarry
m|g|¿Cuál es el animal terrestre más rápido del mundo?|Guepardo|León|Caballo|Gacela
m|g|¿Qué científico propuso la teoría de la relatividad?|Albert Einstein|Isaac Newton|Galileo Galilei|Nikola Tesla
m|g|¿Qué país tiene más habitantes en Sudamérica?|Brasil|Argentina|Colombia|Perú
m|m|¿Qué instrumento tocaba Jimi Hendrix?|Guitarra eléctrica|Batería|Bajo|Piano
m|m|¿Quién compuso «Te recuerdo Amanda»?|Víctor Jara|Patricio Manns|Ángel Parra|Rolando Alarcón
m|a|¿En qué ciudad está el Museo del Louvre?|París|Londres|Roma|Madrid
m|g|¿En qué país está Machu Picchu?|Perú|Bolivia|Ecuador|México
m|g|¿Qué navegante dio nombre al estrecho del extremo sur de Chile?|Fernando de Magallanes|Francis Drake|Cristóbal Colón|Américo Vespucio
m|g|¿Cuál es el planeta más cercano al Sol?|Mercurio|Venus|Marte|Tierra
m|g|¿Cuál es el océano más grande del planeta?|Pacífico|Atlántico|Índico|Ártico
d|g|¿Cuál es la capital de Australia?|Canberra|Sídney|Melbourne|Perth
d|g|¿Cuál es la capital de Canadá?|Ottawa|Toronto|Montreal|Vancouver
d|g|¿En qué año se proclamó la independencia de Chile?|1818|1810|1817|1821
d|g|¿Qué elemento químico tiene el símbolo «Au»?|Oro|Plata|Aluminio|Argón
d|g|¿Qué elemento químico tiene el símbolo «Fe»?|Hierro|Flúor|Fósforo|Fermio
d|g|¿Quién fue el primero en gobernar Chile con el título de Presidente?|Manuel Blanco Encalada|Bernardo O'Higgins|Ramón Freire|Manuel Bulnes
d|g|¿En qué año cayó el Muro de Berlín?|1989|1991|1985|1979
d|g|¿Cuál es el país más pequeño del mundo?|Ciudad del Vaticano|Mónaco|San Marino|Liechtenstein
d|g|¿Cuál es el hueso más largo del cuerpo humano?|Fémur|Tibia|Húmero|Peroné
d|g|¿Qué científico descubrió la penicilina?|Alexander Fleming|Louis Pasteur|Marie Curie|Robert Koch
d|g|¿A qué velocidad aproximada viaja la luz?|300.000 km por segundo|30.000 km por segundo|3.000 km por segundo|3 millones de km por segundo
d|g|¿Qué país tiene la mayor superficie del mundo?|Rusia|Canadá|China|Estados Unidos
d|g|¿Cuántos corazones tiene un pulpo?|3|1|2|4
d|g|¿Qué escritor creó al detective Sherlock Holmes?|Arthur Conan Doyle|Agatha Christie|Edgar Allan Poe|Charles Dickens
d|g|¿Quién escribió «Cien años de soledad»?|Gabriel García Márquez|Mario Vargas Llosa|Julio Cortázar|Isabel Allende
d|g|¿Qué escritor chileno ganó el Premio Nobel de Literatura en 1971?|Pablo Neruda|Nicanor Parra|José Donoso|Vicente Huidobro
d|g|¿Cuántos años duró la llamada Guerra de los Cien Años?|116|100|99|120
d|m|¿Cuántas sinfonías completó Beethoven?|9|5|7|12
d|m|¿De qué país era el compositor Frédéric Chopin?|Polonia|Francia|Austria|Alemania
d|m|¿Qué compositor escribió «Las cuatro estaciones»?|Antonio Vivaldi|Johann Sebastian Bach|Wolfgang Amadeus Mozart|Georg Friedrich Händel
d|m|¿Cuántas teclas tiene un piano estándar?|88|76|92|64
d|m|¿En qué año se separó el grupo The Beatles?|1970|1965|1975|1980
d|m|¿Qué cantante chilena es conocida por «Tu falta de querer»?|Mon Laferte|Denise Rosenthal|Francisca Valenzuela|Javiera Mena
d|m|¿Qué grupo chileno grabó el disco «Alturas de Machu Picchu» en 1981?|Los Jaivas|Inti-Illimani|Quilapayún|Illapu
d|a|¿Quién pintó «La persistencia de la memoria», con relojes derretidos?|Salvador Dalí|René Magritte|Joan Miró|Pablo Picasso
d|a|¿Quién esculpió el «David» de mármol de Florencia?|Miguel Ángel|Donatello|Bernini|Rodin
d|a|¿Qué pintor español pintó el «Guernica»?|Pablo Picasso|Salvador Dalí|Joan Miró|Francisco de Goya
d|a|¿Qué movimiento artístico fundaron Picasso y Braque?|Cubismo|Surrealismo|Impresionismo|Fauvismo
d|a|¿Cuál es el apellido del pintor chileno Roberto, figura del surrealismo?|Matta|Bravo|Zañartu|Mac-Clure
d|g|¿Cuál es la capital de Nueva Zelanda?|Wellington|Auckland|Christchurch|Queenstown
d|g|¿Cuántos países forman la Unión Europea?|27|25|28|30
d|g|¿Cuál es la fórmula química de la sal común?|NaCl|KCl|NaOH|CaCO3
d|g|¿En qué año ocurrió el terremoto de Valdivia, el más fuerte jamás registrado?|1960|1939|1985|2010
d|g|¿Qué mamífero pone huevos y tiene pico de pato?|Ornitorrinco|Equidna|Nutria|Castor
d|g|¿Qué país tiene más pirámides en el mundo?|Sudán|Egipto|México|Perú
`;

const BANK = RAW.trim().split("\n").map((line) => {
  const [level, cat, q, a, ...wrong] = line.split('|').map((x) => x.trim());
  return { key: q, level, cat, q, a, wrong };
}).filter((b) => b.q && b.a && b.wrong.length === 3);

module.exports = { BANK };
