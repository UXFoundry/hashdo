module.exports = {
  state: {
    cardExpiry: 3600, // seconds in an hour
    apiKeyExpiry: 604800 // seconds in a week
  },

  // card input defaults
  baseUrl: process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || 4000),
  googleAPIKey: process.env.GOOGLE_API_KEY,
  iframelyAPIKey: process.env.IFRAMELY_API_KEY,
  firebase: process.env.FIREBASE_URL || 'https://hashdodemo.firebaseIO.com/',

  keenProjectId: process.env.KEEN_PROJECT_ID,
  keenReadKey: process.env.KEEN_READ_KEY,
  keenWriteKey: process.env.KEEN_WRITE_KEY
};
