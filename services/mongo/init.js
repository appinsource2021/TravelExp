db = db.getSiblingDB('travelexpenses');

db.createCollection('users');
db.createCollection('sessions');

db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.sessions.createIndex({ token: 1 }, { unique: true });
db.users.createIndex({ deviceUUID: 1 }, { unique: true });

db.createCollection('destinations');
db.destinations.insertMany([
  { address: 'Wassenberger Str.47-49, 52525 Heinsberg', km: 584 },
  { address: 'Im Schlenk 86, 47055 Duisburg', km: 608 },
]);

db.createCollection('months');
db.createCollection('positions');
db.createCollection('profiles');
