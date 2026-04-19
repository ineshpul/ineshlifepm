// Mock Authentication Service
// FIREBASE INTEGRATION: Replace this with Firebase Auth
// import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

export interface User {
  id: string;
  username: string;
  email: string;
  campus: string;
  avatar: string;
  vertical: number; // height in inches
  streak: number;
  challengesCompleted: number;
  likesReceived: number;
  createdAt: string;
}

class MockAuthService {
  private currentUser: User | null = null;
  private users: Map<string, User & { password: string }> = new Map();

  constructor() {
    // Seed some mock users
    this.users.set('test@iu.edu', {
      id: '1',
      username: 'testuser',
      email: 'test@iu.edu',
      password: 'password',
      campus: 'Indiana University',
      avatar: 'TU',
      vertical: 42,
      streak: 5,
      challengesCompleted: 8,
      likesReceived: 89,
      createdAt: new Date().toISOString(),
    });
  }

  async signUp(username: string, email: string, password: string): Promise<User> {
    // FIREBASE: const auth = getAuth();
    // FIREBASE: const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    if (this.users.has(email)) {
      throw new Error('User already exists');
    }

    const user: User & { password: string } = {
      id: Date.now().toString(),
      username,
      email,
      password,
      campus: 'Indiana University',
      avatar: username.substring(0, 2).toUpperCase(),
      vertical: 0,
      streak: 0,
      challengesCompleted: 0,
      likesReceived: 0,
      createdAt: new Date().toISOString(),
    };

    this.users.set(email, user);
    this.currentUser = { ...user };
    delete (this.currentUser as any).password;
    
    // Store in localStorage for persistence
    localStorage.setItem('leap_user', JSON.stringify(this.currentUser));
    
    return this.currentUser;
  }

  async signIn(email: string, password: string): Promise<User> {
    // FIREBASE: const auth = getAuth();
    // FIREBASE: const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    const user = this.users.get(email);
    
    if (!user || user.password !== password) {
      throw new Error('Invalid email or password');
    }

    this.currentUser = { ...user };
    delete (this.currentUser as any).password;
    
    // Store in localStorage for persistence
    localStorage.setItem('leap_user', JSON.stringify(this.currentUser));
    
    return this.currentUser;
  }

  signOut() {
    // FIREBASE: const auth = getAuth();
    // FIREBASE: await signOut(auth);
    
    this.currentUser = null;
    localStorage.removeItem('leap_user');
  }

  getCurrentUser(): User | null {
    if (this.currentUser) {
      return this.currentUser;
    }

    // Try to restore from localStorage
    const stored = localStorage.getItem('leap_user');
    if (stored) {
      this.currentUser = JSON.parse(stored);
      return this.currentUser;
    }

    return null;
  }

  updateUser(updates: Partial<User>) {
    if (!this.currentUser) return;
    
    this.currentUser = { ...this.currentUser, ...updates };
    localStorage.setItem('leap_user', JSON.stringify(this.currentUser));
    
    // FIREBASE: Update user document in Firestore
    // const db = getFirestore();
    // await updateDoc(doc(db, 'users', this.currentUser.id), updates);
  }
}

export const authService = new MockAuthService();
