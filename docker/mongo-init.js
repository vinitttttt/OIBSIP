const hello = db.adminCommand({ hello: 1 });

if (hello.setName && hello.setName !== 'rs0') {
  throw new Error(`MongoDB is already configured for replica set ${hello.setName}, expected rs0`);
}

if (!hello.setName) {
  const result = rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongo:27017' }],
  });
  if (!result.ok && result.codeName !== 'AlreadyInitialized') {
    throw new Error(`Could not initialize rs0: ${JSON.stringify(result)}`);
  }
}

let primaryReady = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const status = rs.status();
    if (status.set === 'rs0' && status.myState === 1) {
      primaryReady = true;
      break;
    }
  } catch (error) {
    // A new replica set may briefly have no primary while the first member starts.
  }
  sleep(1000);
}

if (!primaryReady) throw new Error('MongoDB replica set rs0 did not elect a primary within 60 seconds');
print('MongoDB replica set rs0 is ready');
