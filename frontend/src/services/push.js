/**
 * Push Notifications - DEVRE DIŞI
 *
 * Firebase yapılandırması (google-services.json) eklenene kadar push
 * notification plugin'i kaldırıldı çünkü Android başlangıçta NATIVE CRASH
 * sebebiyet veriyordu.
 *
 * Bu dosya tüm fonksiyonları no-op olarak export ediyor — çağıran kod
 * (PushNotificationManager) sessizce çalışmaya devam eder.
 *
 * Geri açmak için:
 * 1) `npm install @capacitor/push-notifications`
 * 2) Firebase Console'dan google-services.json indirip android/app/'e koy
 * 3) AndroidManifest.xml'deki meta-data yorumlarını kaldır
 * 4) Bu dosyayı eski haline getir
 */

export async function initializePushNotifications(_onNavigate) {
  // no-op
}

export async function syncStoredPushToken() {
  // no-op
}
