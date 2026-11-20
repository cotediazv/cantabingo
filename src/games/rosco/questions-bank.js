// Banco de preguntas de la Rueda de palabras.
// Formato por línea:  LETRA | categoría | nivel | definición | respuesta
//   categoría: g = cultura general, m = música, a = arte      nivel: f = fácil, m = medio
// En las letras de CONTAINS la respuesta contiene la letra en vez de empezar por ella.
// Para ampliar el banco basta con agregar líneas.
const CONTAINS = new Set(['Ñ', 'X']);

const RAW = `
A|g|f|Continente donde se encuentra Egipto|África
A|g|f|Océano que separa América de Europa|Atlántico
A|g|m|Río más caudaloso del mundo|Amazonas
A|a|f|Arte de proyectar y construir edificios|Arquitectura
A|m|f|Instrumento de cuerda de gran tamaño, de forma triangular, que se toca con las dos manos|Arpa
A|m|m|Pieza para una voz solista dentro de una ópera|Aria
A|a|m|Técnica de pintura con pigmentos diluidos en agua|Acuarela
A|g|f|Insecto que fabrica la miel|Abeja
A|g|m|Capital de Grecia|Atenas
A|g|f|Cuarto mes del año|Abril
A|g|f|País europeo cuya capital es Berlín|Alemania
A|g|f|Cordillera que recorre Sudamérica de norte a sur|Andes
A|g|f|Desierto de Sudamérica considerado el más árido del mundo|Atacama
A|g|f|Continente más grande y poblado del planeta|Asia
A|g|f|Continente helado que rodea el polo sur|Antártica
A|g|f|País y continente a la vez, tierra de canguros y koalas|Australia
B|g|f|Capital de Argentina|Buenos Aires
B|m|f|Compositor alemán de la Novena sinfonía, que perdió el oído|Beethoven
B|m|m|Compositor alemán del Barroco, autor de los Conciertos de Brandeburgo|Bach
B|m|f|Conjunto de tambores y platillos que toca un solo músico|Batería
B|a|m|Estilo artístico europeo del siglo XVII, recargado y dramático|Barroco
B|g|f|Mamífero marino, el animal más grande del planeta|Ballena
B|g|m|País sudamericano sin salida al mar cuya sede de gobierno es La Paz|Bolivia
B|m|f|Banda británica de Liverpool formada por John, Paul, George y Ringo|Beatles
B|a|m|Pintor italiano autor de «El nacimiento de Venus»|Botticelli
B|g|f|Deporte en el que se encesta una pelota en un aro|Baloncesto
B|g|f|País sudamericano donde se habla portugués y se celebra el carnaval de Río|Brasil
B|g|f|Libro sagrado del cristianismo|Biblia
B|g|f|Libertador venezolano que independizó a varios países de Sudamérica|Bolívar
B|g|f|Capital de Alemania, dividida por un muro hasta 1989|Berlín
B|g|f|Capital de Colombia|Bogotá
B|a|f|Danza clásica que se baila en puntas de pie|Ballet
C|g|f|País cuya capital es Santiago|Chile
C|g|f|Navegante que llegó a América en 1492|Colón
C|m|m|Compositor polaco del Romanticismo, célebre por sus nocturnos para piano|Chopin
C|a|m|Movimiento de Picasso y Braque que descompone las figuras en formas geométricas|Cubismo
C|m|m|Instrumento de viento de madera con lengüeta simple|Clarinete
C|g|m|Cuerpo celeste con cola luminosa que orbita alrededor del Sol|Cometa
C|a|f|Arte de hacer películas|Cine
C|g|m|Autor de «Don Quijote de la Mancha»|Cervantes
C|m|f|Grupo de personas que cantan juntas|Coro
C|g|f|Órgano que bombea la sangre|Corazón
C|g|f|País asiático famoso por su Gran Muralla|China
C|g|f|País sudamericano famoso por su café, cuya capital es Bogotá|Colombia
C|g|f|País de América del Norte cuya bandera lleva una hoja de arce|Canadá
C|g|f|Isla del Caribe cuya capital es La Habana|Cuba
C|g|f|Reina más famosa del antiguo Egipto|Cleopatra
D|a|f|Pintor español surrealista de bigote célebre, autor de «La persistencia de la memoria»|Dalí
D|a|m|Escultura de Miguel Ángel que representa a un héroe bíblico|David
D|g|f|Reptiles gigantes que se extinguieron hace millones de años|Dinosaurios
D|m|f|Primera nota de la escala musical|Do
D|g|m|Río europeo que pasa por Viena y Budapest|Danubio
D|g|m|Naturalista inglés autor de la teoría de la evolución|Darwin
D|a|m|Poeta italiano autor de «La Divina Comedia»|Dante
D|m|m|Compositor francés de «Claro de luna»|Debussy
D|g|f|Forma de gobierno en la que el pueblo elige a sus gobernantes|Democracia
D|g|f|Día siguiente al sábado|Domingo
D|a|f|Creador de Mickey Mouse y de un famoso imperio de dibujos animados|Disney
D|g|f|Piedra preciosa transparente, la más dura que existe|Diamante
D|a|f|Vampiro más famoso de la literatura, conde de Transilvania|Drácula
D|g|f|Moneda oficial de Estados Unidos|Dólar
D|g|f|Territorio muy seco y arenoso, como el Sahara|Desierto
E|g|f|País cuya capital es Madrid|España
E|g|f|País de las pirámides de Guiza|Egipto
E|g|m|Monte más alto del mundo|Everest
E|a|f|Arte de modelar o tallar figuras en tres dimensiones|Escultura
E|g|m|Físico autor de la teoría de la relatividad|Einstein
E|g|f|Animal terrestre más grande|Elefante
E|m|m|Cantante estadounidense conocido como «el Rey del rock and roll»|Elvis Presley
E|g|m|Línea imaginaria que divide la Tierra en hemisferio norte y sur|Ecuador
E|a|m|Apellido del ingeniero que da nombre a la torre de hierro de París|Eiffel
E|m|f|Serie de notas ordenadas de grave a agudo|Escala
E|g|f|Continente donde están Francia, Italia y Alemania|Europa
E|g|f|País cuya capital es Washington|Estados Unidos
E|g|f|Inventor estadounidense de la bombilla eléctrica|Edison
E|g|f|Piedra preciosa de color verde intenso|Esmeralda
E|g|f|Moneda común que usan Francia, Italia, Alemania y España|Euro
F|g|f|País cuya capital es París|Francia
F|m|f|Instrumento de viento con forma de tubo y agujeros, que puede ser dulce o travesera|Flauta
F|m|m|Arte andaluz de guitarra, cante, baile y palmas|Flamenco
F|a|m|Pintora mexicana famosa por sus autorretratos, esposa de Diego Rivera|Frida Kahlo
F|a|m|Técnica de pintura mural sobre yeso húmedo|Fresco
F|g|f|Deporte más popular del mundo, se juega con los pies|Fútbol
F|g|m|Ciudad italiana considerada cuna del Renacimiento|Florencia
F|g|f|Segundo mes del año|Febrero
F|a|f|Arte de capturar imágenes con una cámara|Fotografía
F|g|m|Proceso por el que las plantas producen su alimento con la luz del sol|Fotosíntesis
F|g|f|Rey del antiguo Egipto|Faraón
F|g|f|Resto petrificado de un ser vivo de hace millones de años|Fósil
F|a|f|Monstruo creado por un científico en la novela de Mary Shelley|Frankenstein
F|g|f|Líder de la revolución cubana, de barba y uniforme verde olivo|Fidel Castro
F|g|f|Monte más alto y famoso de Japón|Fuji
G|m|f|Instrumento de seis cuerdas típico de España|Guitarra
G|a|m|Arquitecto catalán de la Sagrada Familia|Gaudí
G|a|m|Pintor español de «Los fusilamientos del 3 de mayo»|Goya
G|a|m|Cuadro de Picasso sobre el bombardeo de una villa vasca|Guernica
G|g|m|Científico italiano que perfeccionó el telescopio y defendió que la Tierra gira alrededor del Sol|Galileo
G|g|f|País cuya capital es Atenas|Grecia
G|a|m|Estilo medieval de catedrales con arcos apuntados y vitrales|Gótico
G|g|m|Escritor colombiano autor de «Cien años de soledad»|García Márquez
G|g|f|Felino doméstico que maúlla|Gato
G|g|m|Fuerza que atrae los cuerpos hacia el centro de la Tierra|Gravedad
G|g|f|Luchador que combatía en el Coliseo de la antigua Roma|Gladiador
G|g|f|Líder pacifista de la independencia de la India|Gandhi
G|g|f|Conjunto enorme de estrellas, como la Vía Láctea|Galaxia
H|g|f|Agua en estado sólido|Hielo
H|g|m|Poeta griego al que se atribuyen «La Ilíada» y «La Odisea»|Homero
H|m|m|Compositor austríaco llamado «padre de la sinfonía»|Haydn
H|g|m|Tragedia de Shakespeare sobre un príncipe de Dinamarca|Hamlet
H|g|m|País europeo cuya capital es Budapest|Hungría
H|g|m|Elemento químico más ligero y abundante del universo|Hidrógeno
H|m|f|Canción solemne que representa a un país|Himno
H|g|f|Disciplina que estudia el pasado de la humanidad|Historia
H|m|m|Cultura y género musical urbano nacido en Nueva York, ligado al rap|Hip hop
H|g|f|Héroe de la mitología famoso por su fuerza y sus doce trabajos|Hércules
H|a|f|Barrio de Los Ángeles considerado la capital mundial del cine|Hollywood
H|g|f|Cordillera de Asia donde se encuentran las montañas más altas del mundo|Himalaya
I|g|f|País europeo con forma de bota|Italia
I|a|m|Movimiento pictórico francés de Monet y Renoir|Impresionismo
I|g|f|Estación más fría del año|Invierno
I|g|m|País asiático cuya capital es Nueva Delhi|India
I|g|m|Imperio precolombino con capital en Cuzco|Inca
I|g|f|Porción de tierra rodeada de agua|Isla
I|m|f|Objeto que sirve para producir sonidos musicales|Instrumento
I|g|m|Poema épico griego sobre la guerra de Troya|Ilíada
I|g|f|Red mundial que conecta computadoras|Internet
I|g|f|País del Big Ben, cuna del fútbol y de Shakespeare|Inglaterra
I|g|f|Isla en medio del Pacífico famosa por sus gigantescas estatuas de piedra, los moáis|Isla de Pascua
I|g|f|País europeo del trébol y de la fiesta de San Patricio|Irlanda
I|g|f|Idioma más usado en el mundo para los negocios y la música pop|Inglés
I|g|f|Religión cuyo libro sagrado es el Corán|Islam
J|m|m|Género musical nacido en Nueva Orleans, basado en la improvisación|Jazz
J|g|f|País asiático cuya capital es Tokio|Japón
J|g|m|Planeta más grande del sistema solar|Júpiter
J|g|f|Animal de cuello muy largo|Jirafa
J|g|f|Día entre el miércoles y el viernes|Jueves
J|m|m|Cantautor mexicano apodado «el Divo de Juárez»|Juan Gabriel
J|g|m|Ciudad sagrada para judíos, cristianos y musulmanes|Jerusalén
J|g|f|Sexto mes del año|Junio
J|g|f|Figura central del cristianismo, nacido en Belén|Jesús
J|g|f|Isla del Caribe cuna de Bob Marley|Jamaica
J|g|f|Arte marcial japonés en el que se derriba al rival usando su propia fuerza|Judo
J|g|f|Período de los grandes dinosaurios que dio nombre a un famoso parque de película|Jurásico
L|a|f|Artista italiano que pintó «La Gioconda»|Leonardo da Vinci
L|a|m|Museo de París donde se expone «La Gioconda»|Louvre
L|g|f|Satélite natural de la Tierra|Luna
L|g|f|Capital de Perú|Lima
L|g|m|Capital de Portugal|Lisboa
L|g|f|Capital del Reino Unido|Londres
L|m|m|Músico británico de los Beatles, autor de «Imagine»|Lennon
L|g|f|Felino llamado «rey de la selva»|León
L|m|f|Texto de una canción|Letra
L|a|m|Arte que usa la palabra escrita como medio de expresión|Literatura
L|g|f|Lengua de la antigua Roma, de la que nació el castellano|Latín
L|g|f|Ciudad de Estados Unidos, en pleno desierto, famosa por sus casinos|Las Vegas
L|g|f|Nombre de la famosa estatua de Nueva York que sostiene una antorcha|Libertad
L|g|f|Roca fundida que expulsa un volcán en erupción|Lava
L|g|f|Animal de carga de los Andes, pariente del guanaco y la alpaca|Llama
L|g|f|Presidente de Estados Unidos que abolió la esclavitud|Lincoln
M|m|f|Compositor austríaco, niño prodigio, autor de «La flauta mágica»|Mozart
M|a|m|Artista del Renacimiento que pintó la bóveda de la Capilla Sixtina|Miguel Ángel
M|a|m|Pintor impresionista francés de «Los nenúfares»|Monet
M|g|f|Capital de España|Madrid
M|g|m|Planeta conocido como «el planeta rojo»|Marte
M|g|f|País de los mariachis y los tacos|México
M|a|m|Pintor surrealista nacido en Barcelona, de formas simples y colores vivos|Miró
M|m|m|Cantante estadounidense llamado «el Rey del pop»|Michael Jackson
M|a|f|Lugar donde se conservan y exponen obras de arte|Museo
M|g|m|Mar situado entre Europa, África y Asia|Mediterráneo
M|g|f|Líder sudafricano que pasó 27 años preso y después fue presidente|Mandela
M|g|f|Futbolista argentino del gol de «la mano de Dios»|Maradona
M|g|f|Ciudadela inca en lo alto de las montañas del Perú|Machu Picchu
M|a|f|Retrato más famoso del mundo, de sonrisa misteriosa|Mona Lisa
N|g|f|Gran río de Egipto|Nilo
N|g|m|Físico inglés que formuló la ley de la gravitación universal|Newton
N|m|f|Signo que representa un sonido musical|Nota
N|g|m|Poeta chileno autor de «Veinte poemas de amor y una canción desesperada»|Neruda
N|g|f|Ciudad estadounidense de la Estatua de la Libertad|Nueva York
N|g|m|Planeta más lejano del Sol|Neptuno
N|g|f|Fruta cítrica de color anaranjado|Naranja
N|m|m|Banda estadounidense de grunge liderada por Kurt Cobain|Nirvana
N|g|f|Undécimo mes del año|Noviembre
N|g|m|Premios suecos que se entregan cada año a la ciencia, la literatura y la paz|Nobel
N|g|f|Emperador francés derrotado en Waterloo|Napoleón
N|g|f|País nórdico famoso por sus fiordos y por su salmón|Noruega
N|g|f|Personaje bíblico que construyó un arca para salvar a los animales del diluvio|Noé
N|g|f|Agencia espacial de Estados Unidos|NASA
N|g|f|Tenista español, múltiple campeón de Roland Garros|Nadal
Ñ|g|f|Periodo de doce meses|Año
Ñ|g|f|Gran elevación natural del terreno|Montaña
Ñ|g|f|Persona de pocos años|Niño
Ñ|m|m|Idioma en que cantan Juanes y Joaquín Sabina|Español
Ñ|g|f|Fruta tropical con una corona de hojas|Piña
Ñ|g|m|Arácnido que teje telas|Araña
Ñ|g|f|Lo que se tiene al dormir, con imágenes y sucesos imaginados|Sueño
Ñ|a|m|Profesional que crea el aspecto de objetos, ropa o gráficos|Diseñador
Ñ|g|f|Día siguiente al de hoy|Mañana
Ñ|g|f|Estación del año entre el verano y el invierno|Otoño
Ñ|g|f|Una de las tres carabelas de Colón, junto a la Pinta y la Santa María|Niña
Ñ|g|f|Ave grande de Sudamérica que corre pero no vuela, parecida al avestruz|Ñandú
Ñ|g|f|Hongo comestible blanco, muy usado en pizzas y salsas|Champiñón
Ñ|g|f|Camélido andino de lana finísima, pariente del guanaco|Vicuña
Ñ|g|f|Dedo más pequeño de la mano|Meñique
Ñ|g|f|Arma antigua de gran calibre; también el Gran desfiladero del Colorado|Cañón
Ñ|g|f|Pasta italiana hecha con papa, en forma de bolitas|Ñoquis
O|m|f|Conjunto grande de músicos guiados por un director|Orquesta
O|m|m|Obra de teatro cantada y acompañada por una orquesta|Ópera
O|g|f|Gran masa de agua salada que separa continentes|Océano
O|m|m|Instrumento de teclado y tubos propio de las iglesias|Órgano
O|g|m|Poema épico griego sobre el regreso de Ulises a Ítaca|Odisea
O|a|m|Técnica de pintura con pigmentos mezclados con aceites|Óleo
O|g|f|Metal precioso de color amarillo|Oro
O|g|m|Juegos deportivos mundiales que se celebran cada cuatro años|Olímpicos
O|g|f|Décimo mes del año|Octubre
O|g|m|Continente formado por Australia y las islas del Pacífico|Oceanía
O|g|f|Monte donde vivían los dioses de la mitología griega|Olimpo
O|a|f|Premio más famoso del cine, una estatuilla dorada|Oscar
O|g|f|Sigla con que se llama a un objeto volador no identificado|Ovni
O|g|f|Capital de Noruega|Oslo
P|a|f|Pintor español de «Guernica», uno de los creadores del cubismo|Picasso
P|m|f|Instrumento de teclado con 88 teclas blancas y negras|Piano
P|g|f|Capital de Francia|París
P|g|m|Océano más grande del planeta|Pacífico
P|a|m|Museo de Madrid donde se expone «Las Meninas»|Prado
P|m|f|Género de música popular de Madonna y Michael Jackson|Pop
P|g|f|País cuya capital es Lima|Perú
P|a|f|Arte de representar imágenes con colores sobre una superficie|Pintura
P|m|m|Banda británica autora de «The Wall» y «The Dark Side of the Moon»|Pink Floyd
P|g|m|Construcciones funerarias de los faraones egipcios|Pirámides
P|g|f|Matemático griego famoso por su teorema sobre los triángulos|Pitágoras
P|g|f|Región del extremo sur de Sudamérica, tierra de glaciares y pingüinos|Patagonia
P|g|f|Futbolista brasileño apodado «O Rei», tres veces campeón del mundo|Pelé
P|g|f|País europeo vecino de España, cuya capital es Lisboa|Portugal
P|a|f|Muñeco de madera al que le crece la nariz cuando miente|Pinocho
P|g|f|Jefe de la Iglesia católica, que vive en el Vaticano|Papa
Q|g|m|Hidalgo manchego protagonista de la novela de Cervantes|Quijote
Q|m|m|Banda británica de Freddie Mercury|Queen
Q|g|m|Capital de Ecuador|Quito
Q|g|f|Alimento sólido que se hace con leche cuajada|Queso
Q|g|m|Ciencia que estudia la composición de la materia|Química
Q|m|m|Flauta andina hecha de caña|Quena
Q|g|m|Lengua de los incas, aún hablada en los Andes|Quechua
Q|m|f|Grupo de cinco músicos|Quinteto
Q|g|f|Semilla andina muy nutritiva, alimento de los incas|Quinoa
Q|a|f|Jorobado que toca las campanas de la catedral de Notre Dame|Quasimodo
R|a|m|Movimiento cultural de los siglos XV y XVI que recuperó la Antigüedad clásica|Renacimiento
R|m|f|Género musical de Elvis Presley y los Rolling Stones|Rock
R|g|f|Capital de Italia|Roma
R|a|m|Pintor neerlandés de «La ronda de noche»|Rembrandt
R|m|m|Género musical jamaicano de Bob Marley|Reggae
R|g|f|País más extenso del mundo|Rusia
R|m|f|Elemento de la música que ordena los sonidos en el tiempo|Ritmo
R|a|m|Escultor francés de «El pensador»|Rodin
R|m|m|Género urbano latino popularizado por Daddy Yankee|Reguetón
R|g|m|Joven enamorado de Julieta en la tragedia de Shakespeare|Romeo
R|g|f|Ciudad brasileña del Cristo Redentor y del carnaval más famoso|Río de Janeiro
R|g|f|Futbolista portugués conocido como CR7|Ronaldo
R|a|f|Arquero legendario que robaba a los ricos para dar a los pobres|Robin Hood
R|m|f|Banda británica de rock liderada por Mick Jagger|Rolling Stones
S|g|f|Estrella alrededor de la cual gira la Tierra|Sol
S|g|m|Dramaturgo inglés autor de «Romeo y Julieta»|Shakespeare
S|g|m|Desierto cálido más grande del mundo|Sahara
S|m|m|Composición para orquesta, generalmente en cuatro movimientos|Sinfonía
S|m|f|Género bailable caribeño de Celia Cruz|Salsa
S|m|m|Género musical y baile típico de Brasil, propio del carnaval|Samba
S|a|m|Movimiento artístico de Dalí y Magritte, inspirado en los sueños|Surrealismo
S|g|f|Capital de Chile|Santiago
S|m|f|Cantante colombiana de «Hips Don't Lie»|Shakira
S|g|m|Planeta famoso por sus anillos|Saturno
S|g|f|Guerrero del antiguo Japón, armado con una katana|Samurái
S|g|f|País europeo famoso por sus relojes, sus chocolates y sus bancos|Suiza
S|a|f|Detective inglés de pipa y lupa, creado por Conan Doyle|Sherlock Holmes
S|a|f|Superhéroe llegado de Krypton que lleva una capa roja|Superman
T|m|f|Música y baile típicos de Argentina, de Carlos Gardel|Tango
T|m|f|Instrumento de viento metal con tres pistones|Trompeta
T|a|f|Arte de representar obras ante el público sobre un escenario|Teatro
T|g|f|Capital de Japón|Tokio
T|g|f|Planeta en el que vivimos|Tierra
T|m|f|Instrumento de percusión que se golpea con baquetas o con las manos|Tambor
T|g|m|Transatlántico que se hundió en 1912 tras chocar con un iceberg|Titanic
T|m|m|Voz masculina aguda en la ópera|Tenor
T|g|f|Felino asiático de pelaje rayado|Tigre
T|a|m|Mausoleo de mármol blanco situado en la India|Taj Mahal
T|g|f|Faraón egipcio cuya tumba llena de tesoros se encontró intacta en 1922|Tutankamón
T|g|f|Ciudad de la Antigüedad conquistada gracias a un caballo de madera|Troya
T|a|f|Hombre criado por los monos en la selva africana|Tarzán
T|g|f|Deporte de raqueta que se juega en Wimbledon y Roland Garros|Tenis
T|g|f|Instrumento que sirve para observar las estrellas y los planetas|Telescopio
T|g|f|País situado entre Europa y Asia, cuya ciudad más famosa es Estambul|Turquía
T|g|f|Ola gigante provocada por un terremoto bajo el mar|Tsunami
U|g|m|País sudamericano cuya capital es Montevideo|Uruguay
U|g|f|Fruta con la que se elabora el vino|Uva
U|m|m|Banda irlandesa liderada por Bono|U2
U|g|f|Todo lo que existe: espacio, tiempo y materia|Universo
U|g|m|Séptimo planeta del sistema solar|Urano
U|g|f|Institución de educación superior|Universidad
U|g|m|Héroe griego protagonista de «La Odisea»|Ulises
U|m|m|Instrumento hawaiano pequeño de cuatro cuerdas|Ukelele
U|g|f|País europeo cuya capital es Kiev|Ucrania
U|g|f|Caballo mitológico con un cuerno en la frente|Unicornio
U|g|f|Velocista jamaiquino, el hombre más rápido del mundo|Usain Bolt
V|a|f|Pintor neerlandés de «La noche estrellada»|Van Gogh
V|m|f|Instrumento de cuerda frotada, el más agudo de su familia|Violín
V|a|m|Pintor español de «Las Meninas»|Velázquez
V|m|m|Compositor italiano de «Las cuatro estaciones»|Vivaldi
V|g|m|Ciudad italiana famosa por sus canales|Venecia
V|g|f|Estación más calurosa del año|Verano
V|g|m|País sudamericano cuya capital es Caracas|Venezuela
V|m|m|Compositor italiano de las óperas «La Traviata» y «Aida»|Verdi
V|g|m|Montaña que expulsa lava|Volcán
V|g|m|Segundo planeta del sistema solar|Venus
V|g|f|Navegantes y guerreros nórdicos, famosos por sus barcos largos|Vikingos
V|a|f|Lujoso palacio francés del rey Luis XIV, cerca de París|Versalles
V|g|f|País más pequeño del mundo, dentro de la ciudad de Roma|Vaticano
X|m|f|Instrumento de láminas de madera que se golpean con baquetas|Xilófono
X|g|f|Prueba para evaluar conocimientos|Examen
X|g|f|Automóvil de alquiler con conductor|Taxi
X|g|f|Lo contrario del fracaso|Éxito
X|a|m|Muestra pública de obras de arte|Exposición
X|g|m|Conjunto de palabras que forman un escrito|Texto
X|g|m|Persona que recorre lugares desconocidos para estudiarlos|Explorador
X|g|m|Gas del aire que necesitamos para respirar|Oxígeno
X|m|f|Instrumento de viento metálico y curvo, típico del jazz|Saxofón
X|g|f|Deporte de combate con guantes sobre un ring|Boxeo
X|g|f|Ser que vendría de otro planeta|Extraterrestre
X|a|f|Espada legendaria del rey Arturo|Excalibur
Y|g|f|Parte amarilla del huevo|Yema
Y|g|f|Embarcación de recreo de lujo|Yate
Y|g|m|Disciplina física y mental originaria de la India|Yoga
Y|g|f|Lácteo fermentado, cremoso y algo ácido|Yogur
Y|m|m|Canción de los Beatles cuyo título significa «ayer»|Yesterday
Y|g|m|Hembra del caballo|Yegua
Y|g|m|Raíz comestible también llamada mandioca|Yuca
Y|g|f|Pronombre personal de primera persona del singular|Yo
Y|g|f|Abominable hombre de las nieves|Yeti
Y|g|f|Península de México famosa por sus ruinas mayas|Yucatán
Y|g|f|Hojas secas con las que se prepara el mate|Yerba
Y|g|f|Moneda de Japón|Yen
Z|g|f|Calzado que cubre el pie|Zapato
Z|g|f|Parque donde se exhiben animales|Zoológico
Z|g|m|Dios supremo de la mitología griega|Zeus
Z|g|f|Hortaliza anaranjada que crece bajo tierra|Zanahoria
Z|m|m|Género teatral español que alterna partes cantadas y habladas|Zarzuela
Z|g|f|Mamífero de cola peluda con fama de astuto|Zorro
Z|m|m|Danza folclórica argentina que se baila con pañuelos|Zamba
Z|g|m|Conjunto de los doce signos astrológicos|Zodiaco
Z|g|f|Piedra preciosa de color azul|Zafiro
Z|g|f|Futbolista francés recordado por su cabezazo en la final del Mundial 2006|Zidane
Z|g|f|Título de los antiguos emperadores de Rusia|Zar
Z|a|f|Muerto viviente de las películas de terror|Zombi
`;

const BANK = RAW.trim().split("\n").map((line) => {
  const [letter, cat, level, q, a] = line.split('|').map((x) => x.trim());
  return { key: `${letter}:${a}`, letter, cat, level, q, a };
});

module.exports = { BANK, CONTAINS };
