import { useMatrixStoreReducer } from './useMatrixStoreReducer';
import { useMatrixStoreCRDT } from './useMatrixStoreCRDT';
import type { MatrixStoreAPI } from '../models/matrixState';

const USE_CRDT = import.meta.env.VITE_USE_CRDT === 'true';

export function useMatrixStore(): MatrixStoreAPI {
  const reducerStore = useMatrixStoreReducer();
  const crdtStore = useMatrixStoreCRDT();

  // Return the implementation based on the feature flag
  return USE_CRDT ? crdtStore : reducerStore;
}
