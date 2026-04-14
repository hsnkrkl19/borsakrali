/**
 * Socket.IO Service - Anlık Sinyal Bildirimleri
 * BORSA KRALI - Per.Tgm. Hasan KIRKIL
 * WebSocket ile canlı sinyal yayını
 */

const { Server } = require('socket.io');

let io = null;
let connectedClients = new Set();
let signalHistory = [];

/**
 * Socket.IO sunucusunu başlat
 */
function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Yeni bağlantı: ${socket.id}`);
    connectedClients.add(socket.id);

    // Bağlantı bilgisi gönder
    socket.emit('connected', {
      clientId: socket.id,
      timestamp: new Date().toISOString(),
      activeClients: connectedClients.size
    });

    // Son sinyalleri gönder
    if (signalHistory.length > 0) {
      socket.emit('recent_signals', signalHistory.slice(-10));
    }

    // Client mesajlarını dinle
    socket.on('subscribe_stock', (symbol) => {
      socket.join(`stock_${symbol.toUpperCase()}`);
      console.log(`[Socket.IO] ${socket.id} ${symbol} için abone oldu`);
    });

    socket.on('unsubscribe_stock', (symbol) => {
      socket.leave(`stock_${symbol.toUpperCase()}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Bağlantı koptu: ${socket.id}`);
      connectedClients.delete(socket.id);
    });
  });

  console.log('[Socket.IO] WebSocket sunucusu başlatıldı');
  return io;
}

/**
 * Tüm clientlara sinyal yayınla
 */
function broadcastSignal(signal) {
  if (!io) {
    console.warn('[Socket.IO] Sunucu başlatılmamış');
    return;
  }

  const enrichedSignal = {
    ...signal,
    id: Date.now(),
    timestamp: new Date().toISOString(),
    isNew: true
  };

  // Geçmişe ekle (max 100 sinyal tut)
  signalHistory.push(enrichedSignal);
  if (signalHistory.length > 100) {
    signalHistory = signalHistory.slice(-100);
  }

  // Tüm clientlara yayınla
  io.emit('new_signal', enrichedSignal);

  // Spesifik hisse odasına da yayınla
  if (signal.stockSymbol) {
    io.to(`stock_${signal.stockSymbol}`).emit('stock_signal', enrichedSignal);
  }

  console.log(`[Socket.IO] Sinyal yayınlandı: ${signal.stockSymbol} - ${signal.strategy}`);
}

/**
 * Fiyat güncellemesi yayınla
 */
function broadcastPriceUpdate(stocks) {
  if (!io) return;

  io.emit('price_update', {
    stocks,
    timestamp: new Date().toISOString()
  });
}

/**
 * Bağlı client sayısını al
 */
function getConnectedClientsCount() {
  return connectedClients.size;
}

/**
 * Sinyal geçmişini al
 */
function getSignalHistory() {
  return signalHistory;
}

/**
 * Socket.IO instance'ını al
 */
function getIO() {
  return io;
}

module.exports = {
  initializeSocket,
  broadcastSignal,
  broadcastPriceUpdate,
  getConnectedClientsCount,
  getSignalHistory,
  getIO
};
