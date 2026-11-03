class ChessRealtimeObserver {
  constructor() {
    this.adapter = null;
    this.observerPrx = null;
    this.identity = null;
  }

  async subscribe(communicator, servicePrx, roomCode, nickname, callbacks) {
    await this.cleanupAdapter();

    // Servant de observador en Ice 3.7+ para ES6
    class RealtimeObserverServant extends window.ChessApp.ChessObserver {
      onGameStateChanged(newState, current) {
        console.log("-> [BiDir PUSH OK] Estado recibido en Web:", newState);
        if (callbacks && typeof callbacks.onStateChanged === "function") {
          // Forzar la ejecución en el hilo de renderizado del DOM de Chrome
          window.requestAnimationFrame(() => {
            callbacks.onStateChanged(newState);
          });
        }
      }

      onGameFinished(finalState, winnerNickname, pointsDelta, current) {
        console.log("-> [BiDir PUSH OK] Partida finalizada:", winnerNickname);
        if (callbacks && typeof callbacks.onGameFinished === "function") {
          window.requestAnimationFrame(() => {
            callbacks.onGameFinished(finalState, winnerNickname, pointsDelta);
          });
        }
      }
    }

    // 1. Crear el ObjectAdapter local
    this.adapter = await communicator.createObjectAdapter("");
    const servant = new RealtimeObserverServant();
    // Identidad única generada con UUID
    this.identity = Ice.stringToIdentity(Ice.generateUUID());

    // 2. Registrar servant en el adaptador
    const objectPrx = this.adapter.add(servant, this.identity);
    await this.adapter.activate();

    // 2.1 BiDir: asociar el adaptador a la MISMA conexión WebSocket que usa el servicio,
    //     para que las llamadas que el servidor haga por esa conexión lleguen a este servant.
    const connection = await servicePrx.ice_getConnection();
    connection.setAdapter(this.adapter);

    // 3. Crear el proxy uncheckedCast
    this.observerPrx = window.ChessApp.ChessObserverPrx.uncheckedCast(objectPrx);

    // 4. Registrar en el servidor Java
    await servicePrx.registerObserver(roomCode, nickname, this.observerPrx);
    console.log(`[BiDir Web OK] Observador registrado con éxito para ${nickname} en sala ${roomCode}`);
  }

  async unsubscribe(servicePrx, roomCode, nickname) {
    if (servicePrx && roomCode && nickname) {
      try {
        await servicePrx.unregisterObserver(roomCode, nickname);
      } catch (e) {
        console.warn("Advertencia al desregistrar observador:", e);
      }
    }
    await this.cleanupAdapter();
  }

  async cleanupAdapter() {
    if (this.adapter) {
      try {
        if (this.identity) {
          this.adapter.remove(this.identity);
        }
      } catch (e) {
        console.warn("Error removiendo la identidad del observador:", e);
      }
      try {
        await this.adapter.destroy();
      } catch (e) {
        console.warn("Error destruyendo adaptador previo:", e);
      }
      this.adapter = null;
      this.observerPrx = null;
      this.identity = null;
    }
  }
}

export const chessRealtimeObserver = new ChessRealtimeObserver();