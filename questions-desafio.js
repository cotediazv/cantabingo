// Banco de preguntas de «El Gran Desafío».
// Formato por línea:  nivel | categoría | pregunta | respuesta correcta | incorrecta | incorrecta | incorrecta
//   nivel: f = fácil (escalones 1 a 3), m = medio (4 a 7), d = difícil (8 a 10)
//   categoría: g = cultura general, m = música, a = arte
// Las alternativas se barajan solas al repartir la pregunta. Para ampliar el banco basta con agregar líneas.
// 25 nov: de 116 a 484 preguntas (unas 47 partidas antes de que se repita una), con más temas de Chile, música y
// karaoke. Las escribió Claude: conviene que Cote las revise y borre o corrija las que no le gusten.
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
f|g|¿Cuántos minutos tiene una hora?|60|100|30|90
f|g|¿Qué animal hace «muu»?|Vaca|Oveja|Cerdo|Caballo
f|g|¿Qué representa el color blanco de la bandera de Chile?|La nieve de la cordillera|Las nubes|La paz del mar|La sal del desierto
f|g|¿Cuántas puntas tiene la estrella de la bandera de Chile?|5|6|4|8
f|g|¿Qué fruta amarilla y alargada se asocia con los monos?|Plátano|Manzana|Pera|Kiwi
f|g|¿Cuál es el animal más grande del planeta?|Ballena azul|Tiburón blanco|Elefante africano|Calamar gigante
f|g|¿Cuántas ruedas tiene una bicicleta?|2|3|4|1
f|g|¿Qué instrumento mide la temperatura?|Termómetro|Barómetro|Brújula|Balanza
f|g|¿Cuánto es 9 más 6?|15|14|16|13
f|g|¿Cuánto es la mitad de 100?|50|25|40|75
f|g|¿Qué ave blanca es símbolo de la paz?|Paloma|Gaviota|Cisne|Garza
f|g|¿Qué día viene después del viernes?|Sábado|Jueves|Domingo|Lunes
f|g|¿Cuántos dedos hay en total en las dos manos?|10|8|12|5
f|g|¿Cómo se llama el gran desierto del norte de Chile?|Atacama|Sahara|Gobi|Kalahari
f|g|¿Qué bebida chilena lleva mote y duraznos deshidratados?|Mote con huesillo|Chicha|Cola de mono|Pisco sour
f|g|¿Qué bebida navideña chilena lleva café, leche y aguardiente?|Cola de mono|Ponche|Chicha|Borgoña
f|g|¿Qué pequeño ciervo vive en los bosques del sur de Chile?|Pudú|Guanaco|Llama|Chinchilla
f|g|¿Cuál es la flor nacional de Chile?|Copihue|Rosa|Tulipán|Girasol
f|g|¿Qué árbol del sur de Chile da piñones?|Araucaria|Palmera|Roble|Sauce
f|g|¿Con qué fruta se prepara el guacamole?|Palta|Mango|Tomate|Pepino
f|a|¿Qué color se obtiene al mezclar rojo y amarillo?|Naranjo|Verde|Morado|Café
f|a|¿Qué color se obtiene al mezclar azul y rojo?|Morado|Verde|Naranjo|Amarillo
f|a|¿Qué color se obtiene al mezclar blanco y negro?|Gris|Café|Celeste|Rosado
f|g|¿Cuántas estaciones tiene el año?|4|3|5|6
f|g|¿Qué animal es conocido como «el mejor amigo del hombre»?|Perro|Gato|Caballo|Loro
f|g|¿Qué insecto produce la miel?|Abeja|Mosca|Hormiga|Mariposa
f|g|¿Qué animal tiene trompa?|Elefante|Jirafa|Hipopótamo|Rinoceronte
f|g|¿Qué animal tiene el cuello más largo?|Jirafa|Avestruz|Camello|Caballo
f|g|¿Cuánto es 10 por 10?|100|1.000|20|110
f|g|¿Cuántos años tiene un siglo?|100|10|50|1.000
f|g|¿Cuántos años tiene una década?|10|5|100|12
f|g|¿Qué deporte juega la selección chilena conocida como «La Roja»?|Fútbol|Rugby|Básquetbol|Hockey
f|g|¿Qué estadio de Santiago está en la comuna de Ñuñoa?|Estadio Nacional|Estadio Monumental|Estadio Santa Laura|Estadio Sausalito
f|g|¿Qué país limita con Chile por el este?|Argentina|Perú|Brasil|Paraguay
f|g|¿Qué país limita con Chile por el norte?|Perú|Argentina|Brasil|Ecuador
f|g|¿Qué animal es famoso por cambiar de color?|Camaleón|Iguana|Tortuga|Cocodrilo
f|g|¿Qué parte de la planta crece bajo la tierra?|Raíz|Hoja|Flor|Fruto
f|g|¿Cómo se llama la cría de la rana?|Renacuajo|Pollito|Oruga|Cachorro
f|g|¿Cómo se llama la cría del caballo?|Potrillo|Ternero|Cordero|Cachorro
f|g|¿Cómo se llama la cría de la vaca?|Ternero|Potrillo|Cordero|Lechón
f|g|¿Qué tipo de pez es Nemo, de la película de Pixar?|Pez payaso|Pez globo|Tiburón|Pez espada
f|g|¿Qué personaje de cuento pierde un zapato de cristal?|Cenicienta|Blancanieves|Ariel|Bella
f|g|¿Cómo se llama el muñeco de nieve de «Frozen»?|Olaf|Sven|Kristoff|Hans
f|g|¿Cómo se llama el vaquero de «Toy Story»?|Woody|Buzz|Rex|Slinky
f|g|¿De qué color es Shrek?|Verde|Azul|Café|Amarillo
f|g|¿Cómo se llama el famoso fontanero de los videojuegos de Nintendo?|Mario|Sonic|Link|Pac-Man
f|g|¿Qué superhéroe lanza telarañas?|Spider-Man|Batman|Hulk|Thor
f|g|¿Qué superhéroe se vuelve verde y gigante cuando se enoja?|Hulk|Flash|Aquaman|Capitán América
f|g|¿Cómo se llama el perro de Mickey Mouse?|Pluto|Scooby-Doo|Snoopy|Firulais
f|m|¿Qué instrumento de viento con agujeros se aprende a tocar en el colegio?|Flauta dulce|Guitarra|Violín|Tambor
f|m|¿Qué instrumento de cuerda se toca con un arco?|Violín|Guitarra|Arpa|Ukelele
f|m|¿Qué cantante colombiana canta «Waka Waka»?|Shakira|Karol G|Celia Cruz|Thalía
f|m|¿Qué baile brasileño es el rey del Carnaval de Río?|Samba|Tango|Cueca|Flamenco
f|m|¿Qué baile español se acompaña con castañuelas y palmas?|Flamenco|Salsa|Tango|Cumbia
f|m|¿Qué agitan en la mano los bailarines de cueca?|Un pañuelo|Un abanico|Una cinta|Un sombrero
f|m|¿Quién canta «Despacito» junto a Daddy Yankee?|Luis Fonsi|Ricky Martin|J Balvin|Bad Bunny
f|m|¿Qué cantante es conocida como «la Reina del Pop»?|Madonna|Britney Spears|Lady Gaga|Beyoncé
f|m|¿Qué cantante mexicano es conocido como «el Sol de México»?|Luis Miguel|Juan Gabriel|Alejandro Fernández|Vicente Fernández
f|m|¿Qué aparato se usa para cantar en el karaoke?|Micrófono|Audífono|Control remoto|Linterna
f|m|¿De qué país es el cantante Bad Bunny?|Puerto Rico|México|Colombia|República Dominicana
f|m|¿De qué país es la cantante Karol G?|Colombia|México|Puerto Rico|Argentina
f|g|¿Qué se celebra el 31 de octubre con disfraces y dulces?|Halloween|Navidad|Pascua|San Valentín
f|g|¿Qué se celebra el 14 de febrero?|El Día de los Enamorados|El Día del Niño|La Navidad|El Año Nuevo
f|g|¿Qué animal trae los huevos de chocolate en Pascua?|Conejo|Gallina|Pato|Oso
f|g|¿A cuántos grados hierve el agua al nivel del mar?|100 °C|50 °C|0 °C|200 °C
f|g|¿A cuántos grados se congela el agua?|0 °C|10 °C|-20 °C|32 °C
f|g|¿Cada cuántos años se juega un Mundial de fútbol?|4|2|3|5
f|g|¿Qué selección ganó el Mundial de fútbol de Qatar 2022?|Argentina|Francia|Brasil|Croacia
f|g|¿Qué futbolista chileno es conocido como «el Niño Maravilla»?|Alexis Sánchez|Arturo Vidal|Gary Medel|Claudio Bravo
f|g|¿Qué futbolista chileno es conocido como «el Rey Arturo»?|Arturo Vidal|Alexis Sánchez|Marcelo Salas|Iván Zamorano
f|g|¿Qué figura tiene cuatro lados iguales y cuatro ángulos rectos?|Cuadrado|Triángulo|Círculo|Pentágono
f|g|¿Cuántos centímetros tiene un metro?|100|10|1.000|50
f|g|¿Cuántos gramos tiene un kilo?|1.000|100|10|500
f|g|¿Qué número romano representa el 10?|X|V|L|C
f|g|¿Cuál es el contrario de «alto»?|Bajo|Grande|Largo|Ancho
f|g|¿Con qué respiran los peces?|Branquias|Pulmones|Aletas|Escamas
f|g|¿Cuál es la capital de España?|Madrid|Barcelona|Sevilla|Valencia
f|g|¿Cuál es la capital de Francia?|París|Lyon|Marsella|Niza
f|g|¿En qué ciudad está la Torre Eiffel?|París|Londres|Roma|Berlín
f|g|¿En qué país están las pirámides de Giza?|Egipto|México|Perú|Grecia
f|g|¿En qué ciudad está el Coliseo?|Roma|Atenas|Madrid|París
f|g|¿Qué país tiene al canguro como símbolo?|Australia|Sudáfrica|Brasil|India
f|g|¿De qué país es originario el oso panda?|China|Japón|India|Tailandia
f|g|¿Qué cerro de Santiago tiene una gran estatua de la Virgen en su cumbre?|San Cristóbal|Santa Lucía|Manquehue|Renca
f|g|¿Qué río cruza el centro de Santiago?|Mapocho|Biobío|Loa|Maule
f|g|¿Qué plato chileno se envuelve en hojas de choclo?|Humita|Empanada|Cazuela|Charquicán
f|g|¿Qué plato chileno es una sopa con presa de carne, papa, zapallo y choclo?|Cazuela|Curanto|Completo|Ceviche
f|g|¿En qué zona de Chile es típico el curanto?|Chiloé|Atacama|Valparaíso|Santiago
f|g|¿Qué animal de la Patagonia es pariente de la llama?|Guanaco|Pudú|Puma|Zorro
f|g|¿De qué fruta se hace el pisco?|Uva|Manzana|Frutilla|Durazno
f|g|¿En qué cuento un lobo se disfraza de abuelita?|Caperucita Roja|Los tres chanchitos|Hansel y Gretel|Pinocho
f|g|¿A qué personaje le crece la nariz cuando miente?|Pinocho|Peter Pan|Aladino|Pulgarcito
f|g|¿Qué mes tiene 28 días, o 29 en año bisiesto?|Febrero|Enero|Abril|Junio
f|g|¿Cuántos días tiene un año que no es bisiesto?|365|366|360|364
f|g|¿Con qué órgano pensamos?|Cerebro|Corazón|Estómago|Hígado
f|g|¿Qué ave que no vuela vive en la Antártica?|Pingüino|Gaviota|Albatros|Cóndor
f|g|¿Qué se pone en la punta del árbol de Navidad?|Una estrella|Un zapato|Una flor|Un reloj
f|g|¿Cuántas unidades son una docena?|12|10|6|20
f|g|¿Cuánto es 3 por 3?|9|6|12|8
f|g|¿Qué animal es Dumbo?|Elefante|Ratón|Jirafa|Burro
f|g|¿Cómo se llama el león protagonista de «El Rey León»?|Simba|Scar|Timón|Pumba
f|g|¿Qué princesa de Disney es una sirena?|Ariel|Bella|Aurora|Jazmín
f|g|¿Qué animal africano tiene rayas blancas y negras?|Cebra|Jirafa|Hipopótamo|León
f|g|¿Cómo se llama el palacio de gobierno de Chile?|La Moneda|La Casa Rosada|La Casa Blanca|El Congreso
f|m|¿Qué instrumento de cuatro cuerdas gruesas marca el ritmo en las bandas de rock?|Bajo|Violín|Flauta|Arpa
f|m|¿Qué dúo español cantaba «Macarena»?|Los del Río|Los Prisioneros|Los Jaivas|Los Tres
f|m|¿Cuál de estos es un instrumento de percusión?|Tambor|Guitarra|Violín|Flauta
f|m|¿Qué canta el público chileno después de «Chi chi chi»?|Le le le|La la la|Lo lo lo|Li li li
f|m|¿Qué personaje canta «Libre soy» en la película «Frozen»?|Elsa|Anna|Olaf|Moana
m|g|¿Cuántas regiones tiene Chile?|16|12|15|14
m|g|¿Cuál es la capital de la Región de Magallanes?|Punta Arenas|Puerto Natales|Puerto Williams|Coyhaique
m|g|¿Cuál es la capital de la Región del Biobío?|Concepción|Los Ángeles|Chillán|Talcahuano
m|g|¿Cuál es la capital de la Región de Ñuble?|Chillán|Concepción|Talca|Linares
m|g|¿Cuál es la capital de la Región de La Araucanía?|Temuco|Angol|Villarrica|Pucón
m|g|¿Cuál es la capital de la Región de Coquimbo?|La Serena|Coquimbo|Ovalle|Vallenar
m|g|¿Junto a qué pueblo del norte de Chile está el Valle de la Luna?|San Pedro de Atacama|La Serena|Arica|Iquique
m|g|¿En qué región está el Parque Nacional Torres del Paine?|Magallanes|Aysén|Los Lagos|Atacama
m|g|¿Cuál es el río más largo de Chile?|Loa|Biobío|Maipo|Baker
m|g|¿Cuál es el río más caudaloso de Chile?|Baker|Loa|Mapocho|Maipo
m|g|¿Qué volcán se ve desde Pucón?|Villarrica|Osorno|Calbuco|Llaima
m|g|¿Qué archipiélago chileno es famoso por sus iglesias de madera?|Chiloé|Juan Fernández|Guaitecas|Chonos
m|g|¿En qué archipiélago chileno vivió el marinero que inspiró «Robinson Crusoe»?|Juan Fernández|Chiloé|Isla de Pascua|Isla Navarino
m|g|¿Quién es conocido como el «Padre de la Patria» en Chile?|Bernardo O'Higgins|José Miguel Carrera|Manuel Rodríguez|Arturo Prat
m|g|¿Qué héroe naval chileno murió en el combate de Iquique de 1879?|Arturo Prat|Bernardo O'Higgins|Manuel Rodríguez|Lord Cochrane
m|g|¿Cómo se llamaba el barco de Arturo Prat en el combate naval de Iquique?|Esmeralda|Covadonga|Huáscar|Independencia
m|g|¿Qué día se celebra el Día de las Glorias Navales en Chile?|21 de mayo|18 de septiembre|12 de octubre|1 de mayo
m|g|¿Qué continente tiene más países?|África|Asia|Europa|América
m|g|¿Cuál es el río más caudaloso del mundo?|Amazonas|Nilo|Misisipi|Yangtsé
m|g|¿Cuál es la capital de Japón?|Tokio|Kioto|Osaka|Pekín
m|g|¿Cuál es la capital de Alemania?|Berlín|Múnich|Fráncfort|Hamburgo
m|g|¿Cuál es la capital de Brasil?|Brasilia|Río de Janeiro|São Paulo|Salvador
m|g|¿Cuál es la capital de Colombia?|Bogotá|Medellín|Cali|Cartagena
m|g|¿En qué ciudad boliviana está la sede del gobierno?|La Paz|Sucre|Santa Cruz|Cochabamba
m|g|¿Cuál es la capital de Uruguay?|Montevideo|Punta del Este|Colonia|Salto
m|g|¿Cuál es la capital de Paraguay?|Asunción|Ciudad del Este|Encarnación|Concepción
m|g|¿Cuál es la capital de Ecuador?|Quito|Guayaquil|Cuenca|Loja
m|g|¿Cuál es la capital de Venezuela?|Caracas|Maracaibo|Valencia|Mérida
m|g|¿Cuál es la capital de Estados Unidos?|Washington D. C.|Nueva York|Los Ángeles|Chicago
m|g|¿Cuál es la capital de Portugal?|Lisboa|Oporto|Coímbra|Faro
m|g|¿Cuál es la capital de Egipto?|El Cairo|Alejandría|Luxor|Asuán
m|g|¿En qué país está la Gran Muralla?|China|Japón|Mongolia|India
m|g|¿En qué país está el Taj Mahal?|India|Egipto|Turquía|Irán
m|g|¿En qué país está la Sagrada Familia de Gaudí?|España|Italia|Francia|Portugal
m|g|¿En qué ciudad está el Cristo Redentor del cerro Corcovado?|Río de Janeiro|São Paulo|Buenos Aires|Lima
m|g|¿Qué ciudad es conocida como «la Gran Manzana»?|Nueva York|Los Ángeles|Chicago|Londres
m|g|¿Cuántos planetas tiene el sistema solar?|8|9|7|10
m|g|¿Qué planeta tiene los anillos más conocidos?|Saturno|Júpiter|Marte|Neptuno
m|g|¿Cuál es la estrella más cercana a la Tierra?|El Sol|Sirio|Alfa Centauri|La Estrella Polar
m|g|¿Qué gas expulsamos al respirar?|Dióxido de carbono|Oxígeno|Helio|Hidrógeno
m|g|¿Cuál es el órgano más grande del cuerpo humano?|La piel|El hígado|El cerebro|Los pulmones
m|g|¿Cuántos dientes tiene un adulto con todas sus muelas?|32|28|30|36
m|g|¿Cuántos dientes de leche tiene un niño?|20|32|16|24
m|g|¿Qué vitamina produce el cuerpo con la luz del sol?|Vitamina D|Vitamina C|Vitamina A|Vitamina K
m|g|¿Qué órgano produce la insulina?|Páncreas|Hígado|Riñón|Estómago
m|g|¿Cuántas patas tiene un insecto?|6|8|4|10
m|g|¿Cuánto dura un partido de fútbol, sin contar los descuentos?|90 minutos|80 minutos|100 minutos|120 minutos
m|g|¿En qué deporte se batea un «home run»?|Béisbol|Tenis|Golf|Rugby
m|g|¿Cuántos anillos tiene la bandera olímpica?|5|4|6|7
m|g|¿Cuántos jugadores tiene un equipo de vóleibol en la cancha?|6|5|7|9
m|g|¿En qué ciudad se realizaron los Juegos Panamericanos de 2023?|Santiago|Lima|Buenos Aires|Bogotá
m|g|¿Qué tenista chileno llegó a ser número 1 del mundo en 1998?|Marcelo Ríos|Fernando González|Nicolás Massú|Nicolás Jarry
m|g|¿Qué futbolista es el máximo goleador histórico de la selección chilena?|Alexis Sánchez|Marcelo Salas|Iván Zamorano|Eduardo Vargas
m|g|¿En qué año se jugó el Mundial de fútbol en Chile?|1962|1950|1970|1978
m|g|¿Qué lugar obtuvo Chile en el Mundial de 1962?|Tercero|Primero|Segundo|Cuarto
m|g|¿Cuál es el principal metal que exporta Chile?|Cobre|Oro|Hierro|Plata
m|g|¿Qué famosa mina de cobre está junto a Calama?|Chuquicamata|El Teniente|Los Bronces|Andina
m|g|¿En qué año fue el rescate de los 33 mineros en Chile?|2010|2008|2012|2005
m|g|¿En qué año fue el terremoto del 27F en Chile?|2010|2014|2015|1985
m|g|¿Qué ciudad chilena fue declarada Patrimonio de la Humanidad en 2003?|Valparaíso|Santiago|La Serena|Valdivia
m|g|¿Qué escritora chilena escribió «La casa de los espíritus»?|Isabel Allende|Marcela Paz|Gabriela Mistral|María Luisa Bombal
m|g|¿Qué escritora chilena creó a «Papelucho»?|Marcela Paz|Isabel Allende|Gabriela Mistral|Violeta Parra
m|g|¿Quién escribió «Don Quijote de la Mancha»?|Miguel de Cervantes|Lope de Vega|Federico García Lorca|Gabriel García Márquez
m|g|¿Quién escribió «Romeo y Julieta»?|William Shakespeare|Charles Dickens|Oscar Wilde|Molière
m|g|¿Quién escribió «El Principito»?|Antoine de Saint-Exupéry|Julio Verne|Victor Hugo|Hans Christian Andersen
m|g|¿Qué científico explicó la gravedad, según la leyenda, al ver caer una manzana?|Isaac Newton|Albert Einstein|Galileo Galilei|Charles Darwin
m|g|¿Quién propuso la evolución de las especies por selección natural?|Charles Darwin|Isaac Newton|Gregor Mendel|Louis Pasteur
m|g|¿Quién patentó el teléfono en 1876?|Alexander Graham Bell|Thomas Edison|Nikola Tesla|Guglielmo Marconi
m|g|¿En qué año llegó Cristóbal Colón a América?|1492|1500|1510|1453
m|g|¿En qué año terminó la Segunda Guerra Mundial?|1945|1944|1939|1950
m|g|¿Qué civilización construyó Machu Picchu?|Inca|Maya|Azteca|Olmeca
m|g|¿Quién fundó la ciudad de Santiago?|Pedro de Valdivia|Diego de Almagro|Francisco Pizarro|Hernán Cortés
m|g|¿Cómo se llama la lengua del pueblo mapuche?|Mapudungun|Quechua|Aimara|Rapanui
m|g|¿Cómo se llama el año nuevo mapuche?|We Tripantu|Inti Raymi|Tapati|Nguillatún
m|g|¿Cuántos lados tiene un octágono?|8|6|10|12
m|g|¿Cuánto es 15 por 4?|60|45|54|70
m|g|¿Cuál es la raíz cuadrada de 81?|9|8|7|11
m|g|¿Qué número romano representa el 50?|L|C|X|D
m|g|¿Cuántos segundos tiene una hora?|3.600|360|6.000|1.200
m|g|¿Cuál es el felino más grande del mundo?|Tigre|León|Jaguar|Puma
m|g|¿Cuál es el ave más grande del mundo?|Avestruz|Cóndor|Águila|Albatros
m|g|¿Cuál es la moneda de Japón?|Yen|Yuan|Won|Rupia
m|g|¿Cuál es la moneda del Reino Unido?|Libra esterlina|Euro|Dólar|Franco
m|g|¿Cuál es la moneda de Perú?|Sol|Peso|Boliviano|Real
m|g|¿Qué canal une el Atlántico con el Pacífico en Centroamérica?|Canal de Panamá|Canal de Suez|Canal de Kiel|Canal Beagle
m|g|¿Cómo se llama la galaxia donde está la Tierra?|Vía Láctea|Andrómeda|Triángulo|Sombrero
m|g|¿En qué región de Chile está el valle del Elqui?|Coquimbo|Atacama|Valparaíso|O'Higgins
m|g|¿Qué energía aprovechan los paneles que se instalan en el desierto de Atacama?|Solar|Eólica|Geotérmica|Mareomotriz
m|g|¿Qué fruta se usa en el pisco sour además del pisco?|Limón|Naranja|Piña|Maracuyá
m|m|¿De qué país es la banda Enanitos Verdes, de «Lamento boliviano»?|Argentina|Chile|Bolivia|México
m|m|¿Qué banda chilena canta «Tren al sur»?|Los Prisioneros|Los Tres|Lucybell|La Ley
m|m|¿Qué banda chilena canta «El duelo»?|La Ley|Los Tres|Los Bunkers|Lucybell
m|m|¿Quién era el vocalista de La Ley?|Beto Cuevas|Jorge González|Álvaro Henríquez|Jorge Coulón
m|m|¿Quién era el vocalista de Los Prisioneros?|Jorge González|Beto Cuevas|Álvaro Henríquez|Claudio Narea
m|m|¿Qué banda chilena canta «Llueve sobre la ciudad»?|Los Bunkers|Los Prisioneros|La Ley|Los Jaivas
m|m|¿Qué banda chilena canta «Mira niñita»?|Los Jaivas|Los Bunkers|Inti-Illimani|Congreso
m|m|¿Qué cantante chilena canta «Amor completo»?|Mon Laferte|Javiera Mena|Francisca Valenzuela|Denise Rosenthal
m|m|¿Qué banda canta «Bohemian Rhapsody»?|Queen|The Beatles|Led Zeppelin|Pink Floyd
m|m|¿Qué banda canta «Hotel California»?|Eagles|The Doors|Fleetwood Mac|Bon Jovi
m|m|¿Quién canta «Thriller»?|Michael Jackson|Prince|Stevie Wonder|Lionel Richie
m|m|¿Qué cantante británica canta «Rolling in the Deep» y «Hello»?|Adele|Amy Winehouse|Dua Lipa|Ed Sheeran
m|m|¿Quién canta «Shape of You»?|Ed Sheeran|Justin Bieber|Bruno Mars|Harry Styles
m|m|¿Qué cantante estadounidense canta «Shake It Off»?|Taylor Swift|Katy Perry|Ariana Grande|Selena Gomez
m|m|¿Qué cantante interpretó «I Will Always Love You» en la película «El guardaespaldas»?|Whitney Houston|Mariah Carey|Céline Dion|Tina Turner
m|m|¿Qué cantante canadiense canta «My Heart Will Go On», de «Titanic»?|Céline Dion|Shania Twain|Alanis Morissette|Avril Lavigne
m|m|¿Qué banda irlandesa canta «With or Without You»?|U2|The Cranberries|Coldplay|Oasis
m|m|¿Qué banda irlandesa canta «Zombie»?|The Cranberries|U2|The Corrs|Westlife
m|m|¿Qué banda británica canta «Wonderwall»?|Oasis|Blur|Radiohead|Coldplay
m|m|¿Qué banda canta «Smells Like Teen Spirit»?|Nirvana|Pearl Jam|Foo Fighters|Green Day
m|m|¿Qué cantante español canta «Bailando» junto a Gente de Zona?|Enrique Iglesias|Alejandro Sanz|David Bisbal|Pablo Alborán
m|m|¿Qué cantante mexicano es conocido como «el Divo de Juárez»?|Juan Gabriel|Luis Miguel|José José|Vicente Fernández
m|m|¿Qué cantante mexicano era conocido como «el Príncipe de la Canción»?|José José|Juan Gabriel|Luis Miguel|Marco Antonio Solís
m|m|¿Qué cantante cubana era conocida como «la Reina de la Salsa»?|Celia Cruz|Gloria Estefan|La India|Olga Tañón
m|m|¿Qué cantante colombiano canta «La camisa negra»?|Juanes|Carlos Vives|Maluma|J Balvin
m|m|¿Qué grupo mexicano canta «Rayando el sol»?|Maná|Café Tacvba|Jaguares|Molotov
m|m|¿Qué banda argentina canta «De música ligera»?|Soda Stereo|Los Fabulosos Cadillacs|Enanitos Verdes|Los Pericos
m|m|¿Quién fue el vocalista de Soda Stereo?|Gustavo Cerati|Charly García|Fito Páez|Andrés Calamaro
m|m|¿Qué cantante argentino canta «Flaca»?|Andrés Calamaro|Fito Páez|Charly García|Gustavo Cerati
m|m|¿Qué cantante puertorriqueño canta «Livin' la Vida Loca»?|Ricky Martin|Chayanne|Marc Anthony|Luis Fonsi
m|m|¿Cuántas notas tiene la escala musical básica (do, re, mi…)?|7|5|8|12
m|m|¿Qué nota musical va después de «sol»?|La|Fa|Si|Do
m|m|¿En qué ciudad nació el jazz?|Nueva Orleans|Nueva York|Chicago|Memphis
m|m|¿En qué ciudad se formaron The Beatles?|Liverpool|Londres|Mánchester|Birmingham
m|m|¿Qué grupo británico cantaba «Let It Be» y «Yesterday»?|The Beatles|The Rolling Stones|Queen|Oasis
m|m|¿Quién canta «La Bamba» en su versión de 1958?|Ritchie Valens|Elvis Presley|Carlos Santana|Chuck Berry
m|m|¿En qué mes se realiza normalmente el Festival de Viña del Mar?|Febrero|Diciembre|Septiembre|Mayo
m|m|¿Cómo se le dice al público del Festival de Viña del Mar?|El Monstruo|La Bestia|El Gigante|La Marea
m|m|¿Qué compositor alemán quedó sordo y aun así compuso la Novena Sinfonía?|Ludwig van Beethoven|Johannes Brahms|Richard Wagner|Felix Mendelssohn
m|m|¿Cuántas líneas tiene un pentagrama?|5|4|6|7
m|m|¿Qué instrumento andino es una flauta de cañas de distintos largos?|Zampoña|Quena|Charango|Bombo
m|m|¿De qué país es originaria la cumbia?|Colombia|México|Perú|Argentina
m|m|¿En qué país nació el reggae?|Jamaica|Cuba|Brasil|Puerto Rico
m|m|¿Qué cantante jamaicano canta «No Woman, No Cry»?|Bob Marley|Peter Tosh|Jimmy Cliff|Shaggy
m|m|¿Cómo se llama el vocalista de The Rolling Stones?|Mick Jagger|Keith Richards|Roger Daltrey|Robert Plant
m|a|¿Quién pintó «Los girasoles»?|Vincent van Gogh|Claude Monet|Paul Cézanne|Henri Matisse
m|a|¿Qué pintor francés es famoso por sus «Nenúfares»?|Claude Monet|Édouard Manet|Edgar Degas|Paul Gauguin
m|a|¿En qué museo está la «Mona Lisa»?|Museo del Louvre|Museo del Prado|Museos Vaticanos|Museo Británico
m|a|¿En qué ciudad está el Museo del Prado?|Madrid|Barcelona|Sevilla|Lisboa
m|a|¿Quién pintó «La última cena»?|Leonardo da Vinci|Miguel Ángel|Rafael|Caravaggio
m|a|¿Quién pintó el techo de la Capilla Sixtina?|Miguel Ángel|Leonardo da Vinci|Rafael|Botticelli
m|a|¿Qué pintor noruego pintó «El grito»?|Edvard Munch|Gustav Klimt|Egon Schiele|Wassily Kandinsky
m|a|¿Qué pintor austriaco pintó «El beso», lleno de dorado?|Gustav Klimt|Edvard Munch|Egon Schiele|Marc Chagall
m|a|¿Qué artista colombiano es famoso por sus figuras voluminosas?|Fernando Botero|Diego Rivera|Oswaldo Guayasamín|Rufino Tamayo
m|a|¿Qué muralista mexicano fue esposo de Frida Kahlo?|Diego Rivera|David Alfaro Siqueiros|José Clemente Orozco|Rufino Tamayo
m|a|¿Qué arte usa barro o greda para hacer vasijas y figuras?|Cerámica|Orfebrería|Grabado|Acuarela
m|a|¿Qué técnica de pintura usa pigmentos disueltos en agua?|Acuarela|Óleo|Carboncillo|Pastel
m|a|¿Qué pueblo chileno, cerca de Melipilla, es famoso por sus ollas de greda?|Pomaire|Rari|Chimbarongo|Isla Negra
m|a|¿En qué localidad está la casa de Pablo Neruda frente al mar, con mascarones de proa?|Isla Negra|Viña del Mar|Zapallar|Pichilemu
m|a|¿Cómo se llama la casa de Pablo Neruda en Valparaíso?|La Sebastiana|La Chascona|Isla Negra|La Moneda
m|a|¿En qué país está la Alhambra?|España|Marruecos|Portugal|Turquía
m|a|¿Qué tipo de arte es un «haiku»?|Poesía|Pintura|Escultura|Danza
m|a|¿Qué movimiento artístico encabezó Salvador Dalí?|Surrealismo|Cubismo|Impresionismo|Expresionismo
d|g|¿Cuál es la capital de Turquía?|Ankara|Estambul|Esmirna|Antalya
d|g|¿Cuál es la capital de Marruecos?|Rabat|Casablanca|Marrakech|Fez
d|g|¿Cuál es la capital de Suiza?|Berna|Zúrich|Ginebra|Basilea
d|g|¿Cuál es la capital de Nigeria?|Abuya|Lagos|Kano|Ibadán
d|g|¿Cuál es la capital de Vietnam?|Hanói|Ciudad Ho Chi Minh|Da Nang|Hue
d|g|¿Cuál es la capital de Islandia?|Reikiavik|Oslo|Helsinki|Copenhague
d|g|¿Cuál es la capital de Escocia?|Edimburgo|Glasgow|Aberdeen|Dublín
d|g|¿Cuál es la capital de Finlandia?|Helsinki|Estocolmo|Oslo|Tallin
d|g|¿Cuál es la capital de Kazajistán?|Astaná|Almaty|Taskent|Biskek
d|g|¿Cuál es el lago navegable más alto del mundo?|Titicaca|Chungará|Victoria|Tahoe
d|g|¿Qué país tiene más husos horarios, contando sus territorios?|Francia|Rusia|Estados Unidos|China
d|g|¿Cuál es el océano más pequeño?|Ártico|Índico|Atlántico|Antártico
d|g|¿Cuál es la montaña más alta de Chile?|Ojos del Salado|Aconcagua|Llullaillaco|Tupungato
d|g|¿Cuánto mide aproximadamente Chile continental de norte a sur?|4.300 km|2.000 km|6.500 km|1.500 km
d|g|¿En qué año se fundó Santiago?|1541|1536|1550|1520
d|g|¿Qué conquistador español fue el primero en llegar a Chile, en 1536?|Diego de Almagro|Pedro de Valdivia|Francisco Pizarro|Hernando de Magallanes
d|g|¿Qué toqui mapuche venció a Pedro de Valdivia en Tucapel?|Lautaro|Caupolicán|Galvarino|Colo Colo
d|g|¿Qué batalla de 1818 selló la independencia de Chile?|Batalla de Maipú|Batalla de Chacabuco|Batalla de Rancagua|Batalla de Yungay
d|g|¿Qué batalla de 1814 se conoce como «el Desastre»?|Rancagua|Maipú|Chacabuco|Cancha Rayada
d|g|¿En qué año comenzó la Guerra del Pacífico?|1879|1866|1891|1838
d|g|¿Qué país no participó en la Guerra del Pacífico?|Argentina|Perú|Bolivia|Chile
d|g|¿En qué ciudad se celebraron los primeros Juegos Olímpicos modernos, en 1896?|Atenas|París|Londres|Roma
d|g|¿Cuántos jugadores tiene un equipo de rugby en la cancha?|15|11|13|12
d|g|¿Cuánto mide una maratón?|42,195 km|40 km|21,097 km|50 km
d|g|¿Qué elemento químico tiene el símbolo «Ag»?|Plata|Oro|Argón|Aluminio
d|g|¿Qué elemento químico tiene el símbolo «Na»?|Sodio|Nitrógeno|Neón|Níquel
d|g|¿Qué elemento químico tiene el símbolo «K»?|Potasio|Calcio|Kriptón|Carbono
d|g|¿Qué elemento químico tiene el símbolo «Cu»?|Cobre|Curio|Cesio|Cobalto
d|g|¿Qué elemento químico tiene el número atómico 1?|Hidrógeno|Helio|Oxígeno|Litio
d|g|¿Cuál es el gas más abundante en el aire?|Nitrógeno|Oxígeno|Dióxido de carbono|Argón
d|g|¿Cuál es el planeta más caliente del sistema solar?|Venus|Mercurio|Marte|Júpiter
d|g|¿Cuántos minutos tarda aproximadamente la luz del Sol en llegar a la Tierra?|8|1|30|60
d|g|¿Qué científica fue la primera persona en ganar dos premios Nobel?|Marie Curie|Rosalind Franklin|Ada Lovelace|Lise Meitner
d|g|¿Cuál es el hueso más pequeño del cuerpo humano?|Estribo|Yunque|Martillo|Falange
d|g|¿Cuántos cromosomas tiene una célula humana normal?|46|23|44|48
d|g|¿Cuál es el músculo más grande del cuerpo humano?|Glúteo mayor|Bíceps|Cuádriceps|Pectoral mayor
d|g|¿Cuál es el animal más rápido del mundo, cuando se lanza en picada?|Halcón peregrino|Guepardo|Águila real|Pez vela
d|g|¿Qué mamífero terrestre tiene la gestación más larga?|Elefante|Jirafa|Rinoceronte|Camello
d|g|¿Cuántas cavidades tiene el estómago de una vaca?|4|2|3|1
d|g|¿En qué año se hundió el Titanic?|1912|1905|1920|1898
d|g|¿En qué año comenzó la Revolución Francesa?|1789|1776|1810|1804
d|g|¿Quién fue el primer ser humano en viajar al espacio?|Yuri Gagarin|Neil Armstrong|Buzz Aldrin|John Glenn
d|g|¿Cómo se llamaba la misión que llevó al ser humano a la Luna en 1969?|Apolo 11|Apolo 13|Géminis 4|Vostok 1
d|g|¿Qué emperador francés fue derrotado en Waterloo?|Napoleón Bonaparte|Luis XIV|Carlomagno|Luis XVI
d|g|¿Qué civilización construyó Chichén Itzá?|Maya|Inca|Azteca|Olmeca
d|g|¿Cuál era la capital del imperio azteca?|Tenochtitlan|Cusco|Teotihuacán|Tikal
d|g|¿Cuál era la capital del imperio inca?|Cusco|Lima|Quito|Machu Picchu
d|g|¿Qué pueblo originario construyó los moáis?|Rapanui|Mapuche|Aimara|Diaguita
d|g|¿Qué pueblo originario navegaba en canoas por los canales del extremo sur de Chile?|Kawésqar|Diaguita|Aimara|Atacameño
d|g|¿Cómo se llama la fiesta tradicional de Rapa Nui que se celebra en febrero?|Tapati|We Tripantu|La Tirana|Cuasimodo
d|g|¿En qué región se celebra la Fiesta de La Tirana?|Tarapacá|Antofagasta|Arica y Parinacota|Atacama
d|g|¿Qué día se celebra la Fiesta de La Tirana?|16 de julio|18 de septiembre|8 de diciembre|25 de julio
d|g|¿Qué idioma tiene más hablantes nativos en el mundo?|Chino mandarín|Inglés|Español|Hindi
d|g|¿Cuántos países hay en Sudamérica?|12|10|13|15
d|g|¿Qué país sudamericano no tiene salida al mar, además de Bolivia?|Paraguay|Uruguay|Ecuador|Venezuela
d|g|¿Cuál es el país más pequeño de Sudamérica?|Surinam|Uruguay|Guyana|Ecuador
d|g|¿Qué estrecho separa Europa de África?|Gibraltar|Bósforo|Magallanes|Ormuz
d|g|¿Cuál es el punto más profundo de los océanos?|Fosa de las Marianas|Fosa de Atacama|Fosa de Puerto Rico|Fosa de Java
d|g|¿Quién escribió «La Odisea»?|Homero|Virgilio|Sófocles|Platón
d|g|¿Quién escribió «La metamorfosis», donde un hombre despierta convertido en insecto?|Franz Kafka|Albert Camus|Fiódor Dostoievski|Thomas Mann
d|g|¿Quién escribió la novela «1984»?|George Orwell|Aldous Huxley|Ray Bradbury|H. G. Wells
d|g|¿Quién escribió «El túnel»?|Ernesto Sabato|Jorge Luis Borges|Julio Cortázar|Adolfo Bioy Casares
d|g|¿Qué escritor argentino escribió «El Aleph»?|Jorge Luis Borges|Ernesto Sabato|Julio Cortázar|Manuel Puig
d|g|¿Qué escritor chileno escribió «Hijo de ladrón»?|Manuel Rojas|José Donoso|Alberto Blest Gana|Francisco Coloane
d|g|¿Qué escritor chileno escribió «Martín Rivas»?|Alberto Blest Gana|Manuel Rojas|Baldomero Lillo|José Donoso
d|g|¿Qué escritor chileno escribió «Sub terra», sobre los mineros del carbón?|Baldomero Lillo|Manuel Rojas|Pablo de Rokha|Alberto Blest Gana
d|g|¿Qué poeta chileno creó la «antipoesía»?|Nicanor Parra|Pablo Neruda|Vicente Huidobro|Gonzalo Rojas
d|g|¿Qué poeta chileno escribió «Altazor»?|Vicente Huidobro|Pablo Neruda|Nicanor Parra|Raúl Zurita
d|g|¿Qué poeta chileno ganó el Premio Cervantes en 2003?|Gonzalo Rojas|Nicanor Parra|Jorge Edwards|Raúl Zurita
d|g|¿Qué escritor chileno escribió «Los detectives salvajes»?|Roberto Bolaño|José Donoso|Alejandro Zambra|Pedro Lemebel
d|g|¿Cuál era el nombre real de Gabriela Mistral?|Lucila Godoy Alcayaga|Ester Huneeus Salas|María Luisa Bombal|Isabel Allende Llona
d|g|¿Cuál era el nombre real de Pablo Neruda?|Neftalí Reyes Basoalto|Vicente García-Huidobro|Nicanor Parra Sandoval|Manuel Rojas Sepúlveda
d|m|¿Qué compositor austriaco escribió la ópera «La flauta mágica»?|Wolfgang Amadeus Mozart|Joseph Haydn|Franz Schubert|Johann Strauss
d|m|¿Qué compositor ruso escribió «El lago de los cisnes»?|Piotr Ilich Chaikovski|Serguéi Rajmáninov|Ígor Stravinski|Nikolái Rimski-Kórsakov
d|m|¿Qué compositor francés escribió el «Bolero»?|Maurice Ravel|Claude Debussy|Erik Satie|Georges Bizet
d|m|¿Qué compositor escribió la ópera «Carmen»?|Georges Bizet|Giuseppe Verdi|Giacomo Puccini|Gioachino Rossini
d|m|¿Qué compositor italiano escribió «La traviata» y «Aida»?|Giuseppe Verdi|Giacomo Puccini|Gioachino Rossini|Antonio Vivaldi
d|m|¿Qué pianista chileno fue uno de los grandes intérpretes de Beethoven del siglo XX?|Claudio Arrau|Roberto Bravo|Vicente Bianchi|Luis Advis
d|m|¿Cuántas cuerdas tiene un arpa de concierto?|47|36|52|24
d|m|¿Qué instrumento andino se fabricaba con el caparazón de un quirquincho?|Charango|Quena|Zampoña|Cuatro
d|m|¿Qué banda británica lanzó el disco «The Dark Side of the Moon»?|Pink Floyd|Led Zeppelin|The Who|Genesis
d|m|¿Qué banda canta «Stairway to Heaven»?|Led Zeppelin|Deep Purple|Black Sabbath|The Rolling Stones
d|m|¿Qué cantante se presentaba como Ziggy Stardust?|David Bowie|Elton John|Freddie Mercury|Prince
d|m|¿En qué año murió Elvis Presley?|1977|1969|1981|1985
d|m|¿En qué año murió Michael Jackson?|2009|2005|2012|2001
d|m|¿En qué año se realizó el festival de Woodstock?|1969|1965|1972|1975
d|m|¿Quién compuso «Arriba en la cordillera»?|Patricio Manns|Víctor Jara|Violeta Parra|Ángel Parra
d|m|¿Quién compuso «Volver a los 17»?|Violeta Parra|Isabel Parra|Margot Loyola|Gabriela Pizarro
d|m|¿Quién compuso «El derecho de vivir en paz»?|Víctor Jara|Violeta Parra|Patricio Manns|Rolando Alarcón
d|m|¿Qué banda chilena lanzó el disco «Corazones» en 1990?|Los Prisioneros|Los Tres|La Ley|Upa!
d|m|¿Qué banda chilena grabó su famoso «MTV Unplugged» en 1995?|Los Tres|La Ley|Los Prisioneros|Los Bunkers
d|m|¿De qué país es el grupo de cumbia Los Mirlos?|Perú|Chile|Colombia|México
d|a|¿Qué pintor neerlandés pintó «La joven de la perla»?|Johannes Vermeer|Rembrandt|Frans Hals|Jan van Eyck
d|a|¿Quién pintó «Las Meninas»?|Diego Velázquez|Francisco de Goya|El Greco|Bartolomé Murillo
d|a|¿Quién pintó «El nacimiento de Venus»?|Sandro Botticelli|Tiziano|Rafael|Leonardo da Vinci
d|a|¿Qué arquitecto diseñó el Parque Güell de Barcelona?|Antoni Gaudí|Le Corbusier|Santiago Calatrava|Frank Gehry
d|a|¿Qué arquitecto diseñó el Museo Guggenheim de Bilbao?|Frank Gehry|Norman Foster|Renzo Piano|Zaha Hadid
d|a|¿Qué escultor francés creó «El pensador»?|Auguste Rodin|Camille Claudel|Edgar Degas|Aristide Maillol
d|a|¿Qué pintor francés es famoso por sus cuadros de bailarinas de ballet?|Edgar Degas|Claude Monet|Pierre-Auguste Renoir|Paul Cézanne
d|a|¿Qué pintor ruso es considerado uno de los pioneros del arte abstracto?|Wassily Kandinsky|Marc Chagall|Iliá Repin|Iván Aivazovski
d|a|¿Qué artista estadounidense pintó las latas de sopa Campbell?|Andy Warhol|Roy Lichtenstein|Jackson Pollock|Keith Haring
d|a|¿Qué pintor chileno es famoso por sus cuadros hiperrealistas de paquetes envueltos?|Claudio Bravo|Roberto Matta|Nemesio Antúnez|José Balmes
d|a|¿De qué país era el autor del mural «Presencia de América Latina», en Concepción?|México|Chile|Argentina|Perú
d|a|¿En qué ciudad chilena está el Museo a Cielo Abierto, con murales en los cerros?|Valparaíso|Santiago|Antofagasta|Valdivia
d|a|¿Qué pintor chileno pintó el cuadro «Fundación de Santiago»?|Pedro Lira|Claudio Bravo|Roberto Matta|Alfredo Valenzuela Puelma
d|a|¿En qué pueblo chileno es famosa la artesanía de greda negra?|Quinchamalí|Pomaire|Rari|Chimbarongo
d|a|¿En qué país nació el origami?|Japón|China|Corea|India
`;

const BANK = RAW.trim().split("\n").map((line) => {
  const [level, cat, q, a, ...wrong] = line.split('|').map((x) => x.trim());
  return { key: q, level, cat, q, a, wrong };
}).filter((b) => b.q && b.a && b.wrong.length === 3);

module.exports = { BANK };
