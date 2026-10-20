import { MongoClient, type Db, type Collection, type Document } from "mongodb"

const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = "alteza-house"

type MongoCache = {
  client: MongoClient | null
  db: Db | null
  promise: Promise<MongoClient> | null
}

declare global {
  var __mongoCache: MongoCache | undefined
}

const mongoCache: MongoCache =
  globalThis.__mongoCache ??
  ({
    client: null,
    db: null,
    promise: null,
  } satisfies MongoCache)

// Reuse connections across hot reloads and warm serverless invocations.
globalThis.__mongoCache = mongoCache

async function connectClient(): Promise<MongoClient> {
  if (mongoCache.client) return mongoCache.client

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set")
  }

  // Cache the in-flight promise to avoid parallel cold-start races.
  if (!mongoCache.promise) {
    mongoCache.promise = new MongoClient(MONGODB_URI, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
    }).connect()
  }

  mongoCache.client = await mongoCache.promise
  return mongoCache.client
}

export async function getClient(): Promise<MongoClient> {
  return connectClient()
}

export async function getDb(): Promise<Db> {
  if (mongoCache.db) return mongoCache.db
  const client = await connectClient()
  mongoCache.db = client.db(DB_NAME)
  return mongoCache.db
}

type CollectionGetter = <TSchema extends Document = Document>(
  name: string
) => Promise<Collection<TSchema>>

const defaultGetCollection: CollectionGetter = async (name) => {
  const db = await getDb()
  return db.collection(name)
}

let collectionGetter: CollectionGetter = defaultGetCollection

export function setCollectionGetterForTests(getter: CollectionGetter | null) {
  collectionGetter = getter || defaultGetCollection
}

export async function getCollection<TSchema extends Document = Document>(
  name: string
): Promise<Collection<TSchema>> {
  return collectionGetter<TSchema>(name)
}
