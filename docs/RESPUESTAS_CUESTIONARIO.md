# Respuestas cuestionario - Taller Ajedrez con ZeroC Ice

## 1. Conexiones bidireccionales (BiDir) vs callbacks tradicionales

En un callback normal, como el que usa JavaFX, el cliente crea un adaptador con un endpoint TCP propio y le manda al servidor un proxy que tiene su IP y su puerto. Así el servidor abre una conexión nueva hacia el cliente cuando quiere notificarle algo.

En el navegador eso no se puede hacer porque JavaScript no puede abrir puertos para escuchar conexiones, por seguridad del navegador. Lo único que puede hacer es abrir el WebSocket hacia el servidor. Por eso en el cliente web creamos el adaptador con `createObjectAdapter("")`, o sea sin endpoints, y lo asociamos a la conexión que ya existe con `servicePrx.ice_getConnection()` y `connection.setAdapter(adapter)`. Con eso le decimos a Ice que si llegan peticiones por ese mismo WebSocket las atienda el servant del observador.

El problema es que el proxy que le llega al servidor no tiene endpoints, entonces el servidor no sabe a dónde mandarle las llamadas. Ahí entra `observer.ice_fixed(current.con)` en `ChessServiceImpl`: amarra el proxy a la conexión por la que llegó la llamada de `registerObserver`. Desde ese momento, cuando `GameRoom` llama `onGameStateChanged`, la llamada se devuelve por el mismo WebSocket que abrió el navegador. Por eso hay que validar primero que `ice_getEndpoints().length == 0`, para no hacerle esto a los proxies de JavaFX que sí tienen endpoints.

## 2. Transporte TCP vs WebSockets en ZeroC Ice

En `ChessServerApp` se crea un solo adaptador (`ChessServerAdapter`) con dos endpoints al tiempo: `default -p 10000` para TCP y `ws -h 0.0.0.0 -p 10002` para WebSocket. El servant `ChessServiceImpl` se agrega una sola vez a ese adaptador con la identidad `ChessService`.

Ice se encarga de la capa de transporte, entonces cuando llega una invocación no importa si vino por TCP o por WebSocket: Ice la decodifica igual (el protocolo y el formato de los datos son los mismos) y la manda al mismo método del servant. Por eso la lógica del juego, que está en `GameRoom` y `ChessRules`, no se tiene que duplicar ni saber qué tipo de cliente está jugando. La única diferencia la vimos en los callbacks, que en el caso web necesitan el `ice_fixed`.

## 3. Empaquetado del contrato con slice2js

`slice2js` convierte el archivo `ChessService.ice` en `ChessService.js`, que trae las clases de los structs (`Position`, `GameState`, etc.), los enums, las excepciones, el proxy `ChessServicePrx` y la clase base `ChessObserver` para implementar el servant.

El archivo generado está envuelto en una función que recibe `module`, `require` y `exports`. Cuando se carga en el navegador con una etiqueta `<script>` normal, `exports` termina siendo `window`, y con `Ice._ModuleRegistry.module("ChessApp")` se crea el espacio de nombres `ChessApp` y queda disponible como `window.ChessApp`. Por eso en `chessClientService.js` usamos `window.ChessApp.ChessServicePrx` y `window.ChessApp.Position`.

Hay que cargar primero `Ice.min.js` porque el código generado depende totalmente de Ice: usa el objeto global `Ice`, hereda de clases como `Ice.ObjectPrx`, `Ice.Value` y `Ice.EnumBase`, y usa sus funciones para serializar los datos. Si `ChessService.js` se carga antes, `Ice` no existe todavía y sale error. En el `index.html` el orden es `Ice.min.js`, después `ChessService.js` y al final `app.js` como módulo.

## 4. Validación autoritativa

`chessRulesHelper.js` solo calcula las casillas candidatas para mostrar los puntos y los anillos en el tablero, es una ayuda visual para el usuario. No revisa todo, por ejemplo no verifica si el movimiento deja al rey en jaque.

Aparte de eso, el código del cliente corre en el navegador del usuario y cualquiera lo puede modificar, por ejemplo desde la consola de Chrome o llamando `makeMove` directamente con coordenadas inventadas o cuando no es su turno. También puede pasar que el cliente tenga un estado viejo del tablero. Si el servidor confiara en lo que manda el cliente, cualquiera podría hacer trampa o dañar la partida de los otros.

Por eso `GameRoom.makeMove` vuelve a validar todo: que la partida esté en curso, que sea el turno de ese jugador, que la pieza sea suya, que el movimiento sea legal según `ChessRules` y que no deje a su rey en jaque. El servidor es el que tiene el estado real del juego y es el único que decide si un movimiento vale. Si no es válido lanza `InvalidMoveException` o `NotPlayerTurnException` y no se le notifica nada a los demás.
