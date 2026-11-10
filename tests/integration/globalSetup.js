import { MongoMemoryReplSet } from "mongodb-memory-server";

export default async function setup({ provide }) {
  // A replica set is required, because the points and rewards code uses transactions.
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  provide("mongoUri", replSet.getUri("ecoclean_test"));
  return async () => {
    await replSet.stop();
  };
}
