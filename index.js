module.exports = {
  version: require('./package.json').version,
  analytics: require('./lib/analytics'), 
  db: require('./lib/db'),
  packs: require('./lib/packs'),
  card: require('./lib/card'),
  utils: require('./lib/utils')
};