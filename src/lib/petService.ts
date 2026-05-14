import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  Timestamp,
  type DocumentData
} from 'firebase/firestore';
import { db, auth } from './firebase';

export enum PetStatus {
  LOST = 'lost',
  FOUND = 'found',
  FOR_ADOPTION = 'for_adoption',
  ADOPTED = 'adopted',
  REUNITED = 'reunited'
}

export interface Pet {
  id: string;
  name?: string;
  species: 'dog' | 'cat' | 'other';
  breed?: string;
  color?: string;
  status: PetStatus;
  gender: 'male' | 'female' | 'unknown';
  description: string;
  location: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  contactInfo: string;
  imageUrl?: string;
  imageUrls?: string[];
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  isAdminVerified: boolean;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const PETS_COLLECTION = 'pets';

export const getPets = async (status?: PetStatus) => {
  try {
    const q = status 
      ? query(collection(db, PETS_COLLECTION), where('status', '==', status), orderBy('createdAt', 'desc'))
      : query(collection(db, PETS_COLLECTION), orderBy('createdAt', 'desc'));
      
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pet));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, PETS_COLLECTION);
    return [];
  }
};

export const createPet = async (petData: Omit<Pet, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'isAdminVerified'>) => {
  if (!auth.currentUser) throw new Error('Must be signed in');
  
  try {
    return await addDoc(collection(db, PETS_COLLECTION), {
      ...petData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: auth.currentUser.uid,
      isAdminVerified: false
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, PETS_COLLECTION);
  }
};

export const updatePet = async (id: string, petData: Partial<Pet>) => {
  try {
    const petRef = doc(db, PETS_COLLECTION, id);
    return await updateDoc(petRef, {
      ...petData,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PETS_COLLECTION}/${id}`);
  }
};

export const deletePet = async (id: string) => {
  try {
    const petRef = doc(db, PETS_COLLECTION, id);
    return await deleteDoc(petRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${PETS_COLLECTION}/${id}`);
  }
};
