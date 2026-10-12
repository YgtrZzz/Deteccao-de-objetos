import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'armario.db';

// Mantém uma única instância aberta do banco (padrão Singleton assíncrono)
let dbPromise = null;

/**
 * Abre (ou reutiliza) a conexão com o banco de dados 'armario.db'.
 * @returns {Promise<SQLite.SQLiteDatabase>}
 */
export async function getDatabase() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME);
  }
  return dbPromise;
}

/**
 * Inicializa o banco 'armario.db' e cria a tabela 'inventory' caso ainda não exista.
 * Colunas:
 *  - id: INTEGER PRIMARY KEY AUTOINCREMENT
 *  - name: TEXT
 *  - created_at: TEXT
 * @returns {Promise<SQLite.SQLiteDatabase>}
 */
export async function initDatabase() {
  try {
    const db = await getDatabase();
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    return db;
  } catch (error) {
    console.error('[Database] Erro ao inicializar o banco armario.db:', error);
    throw error;
  }
}

/**
 * Insere um novo item na tabela 'inventory'.
 * @param {string} name Nome do item identificado/informado.
 * @returns {Promise<{ id: number, name: string, created_at: string }>}
 */
export async function insertItem(name) {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) {
    throw new Error('O nome do item não pode ficar vazio.');
  }

  try {
    const db = await initDatabase();
    const createdAt = new Date().toISOString();

    const result = await db.runAsync(
      'INSERT INTO inventory (name, created_at) VALUES (?, ?);',
      [cleanName, createdAt]
    );

    return {
      id: result.lastInsertRowId,
      name: cleanName,
      created_at: createdAt,
    };
  } catch (error) {
    console.error('[Database] Erro ao inserir item:', error);
    throw error;
  }
}

/**
 * Lista todos os itens salvos na tabela 'inventory', ordenados do mais recente para o mais antigo.
 * @returns {Promise<Array<{ id: number, name: string, created_at: string }>>}
 */
export async function getItems() {
  try {
    const db = await initDatabase();
    const items = await db.getAllAsync(
      'SELECT id, name, created_at FROM inventory ORDER BY id DESC;'
    );
    return items;
  } catch (error) {
    console.error('[Database] Erro ao listar itens:', error);
    throw error;
  }
}

/**
 * Remove um item específico pelo ID.
 * @param {number} id ID do item a ser removido.
 */
export async function deleteItem(id) {
  try {
    const db = await initDatabase();
    await db.runAsync('DELETE FROM inventory WHERE id = ?;', [id]);
  } catch (error) {
    console.error('[Database] Erro ao remover item:', error);
    throw error;
  }
}

// Aliases em inglês e português para facilitar importação
export const initDB = initDatabase;
export const inicializarBanco = initDatabase;
export const addItem = insertItem;
export const inserirItem = insertItem;
export const getAllItems = getItems;
export const listarItens = getItems;
export const removerItem = deleteItem;

export default {
  getDatabase,
  initDatabase,
  insertItem,
  getItems,
  deleteItem,
  inicializarBanco,
  inserirItem,
  listarItens,
  removerItem,
};
