import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';

export interface CollaborationAccount {
  id: string;
  title: string;
  description?: string;
  bankName: string;
  alias?: string;
  cbu?: string;
  cvu?: string;
  order: number;
}

export interface VolunteerRequest {
  id: string;
  fullName: string;
  residenceZone: string;
  whatsapp: string;
  userId: string;
  createdAt: any;
  status: 'pending' | 'reviewed' | 'accepted';
}

const COLLAB_COLLECTION = 'collaboration_accounts';
const VOLUNTEER_COLLECTION = 'volunteer_requests';

// Collaboration Accounts Service
export const getCollaborationAccounts = async () => {
  const q = query(collection(db, COLLAB_COLLECTION), orderBy('order', 'asc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollaborationAccount));
};

export const createCollaborationAccount = async (data: Omit<CollaborationAccount, 'id'>) => {
  return await addDoc(collection(db, COLLAB_COLLECTION), data);
};

export const updateCollaborationAccount = async (id: string, data: Partial<CollaborationAccount>) => {
  const ref = doc(db, COLLAB_COLLECTION, id);
  return await updateDoc(ref, data);
};

export const deleteCollaborationAccount = async (id: string) => {
  const ref = doc(db, COLLAB_COLLECTION, id);
  return await deleteDoc(ref);
};

// Volunteer Requests Service
export const createVolunteerRequest = async (data: Omit<VolunteerRequest, 'id' | 'createdAt' | 'status'>) => {
  if (!auth.currentUser) throw new Error('Must be signed in');
  return await addDoc(collection(db, VOLUNTEER_COLLECTION), {
    ...data,
    createdAt: Timestamp.now(),
    status: 'pending'
  });
};

export const getVolunteerRequests = async () => {
  const q = query(collection(db, VOLUNTEER_COLLECTION), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VolunteerRequest));
};
