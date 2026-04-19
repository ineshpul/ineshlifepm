// Mock Data Service
// FIREBASE INTEGRATION: Replace this with Firestore queries
// import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  date: string;
  expiresAt: string;
  participantCount: number;
  level1: string;
  level2: string;
  level3: string;
}

export interface Video {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  challengeId: string;
  challengeTitle: string;
  url: string;
  thumbnail?: string;
  vertical: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  createdAt: string;
  attemptsUsed: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  avatar: string;
  vertical: number;
  streak: number;
  challengesCompleted: number;
  rank: number;
}

class MockDataService {
  private challenges: Challenge[] = [
    {
      id: '1',
      title: 'Introduce yourself in 10 seconds',
      description: 'New challenge dropping soon. Same prompt for everyone. No retakes. No filler.',
      date: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours from now
      participantCount: 247,
      level1: 'Say your name and major',
      level2: 'Add your biggest fear and dream',
      level3: 'Do it while doing a handstand',
    },
  ];

  private videos: Video[] = [
    {
      id: '1',
      userId: '2',
      username: 'kevinthebold',
      avatar: 'K',
      challengeId: '1',
      challengeTitle: 'Introduce yourself in 10 seconds',
      url: '',
      vertical: 42,
      likes: 342,
      comments: 84,
      shares: 19,
      views: 14800,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      attemptsUsed: 1,
    },
    {
      id: '2',
      userId: '3',
      username: 'sarahleaps',
      avatar: 'S',
      challengeId: '1',
      challengeTitle: 'Introduce yourself in 10 seconds',
      url: '',
      vertical: 39,
      likes: 256,
      comments: 62,
      shares: 12,
      views: 11200,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      attemptsUsed: 2,
    },
    {
      id: '3',
      userId: '4',
      username: 'mikejumps',
      avatar: 'M',
      challengeId: '1',
      challengeTitle: 'Introduce yourself in 10 seconds',
      url: '',
      vertical: 35,
      likes: 198,
      comments: 45,
      shares: 8,
      views: 8900,
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      attemptsUsed: 3,
    },
  ];

  private leaderboard: LeaderboardEntry[] = [
    {
      userId: '2',
      username: 'kevinthebold',
      avatar: 'K',
      vertical: 42,
      streak: 7,
      challengesCompleted: 12,
      rank: 1,
    },
    {
      userId: '3',
      username: 'sarahleaps',
      avatar: 'S',
      vertical: 39,
      streak: 5,
      challengesCompleted: 10,
      rank: 2,
    },
    {
      userId: '4',
      username: 'mikejumps',
      avatar: 'M',
      vertical: 35,
      streak: 4,
      challengesCompleted: 9,
      rank: 3,
    },
    {
      userId: '5',
      username: 'jess_bold',
      avatar: 'J',
      vertical: 31,
      streak: 3,
      challengesCompleted: 8,
      rank: 4,
    },
  ];

  getTodayChallenge(): Challenge {
    // FIREBASE: const db = getFirestore();
    // FIREBASE: const q = query(collection(db, 'challenges'), where('date', '==', today));
    // FIREBASE: const snapshot = await getDocs(q);
    
    return this.challenges[0];
  }

  getFeed(userId?: string): Video[] {
    // FIREBASE: const db = getFirestore();
    // FIREBASE: const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'));
    
    return [...this.videos].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getLeaderboard(): LeaderboardEntry[] {
    // FIREBASE: const db = getFirestore();
    // FIREBASE: const q = query(collection(db, 'users'), orderBy('vertical', 'desc'));
    
    return [...this.leaderboard].sort((a, b) => b.vertical - a.vertical);
  }

  getUserVideos(userId: string): Video[] {
    // FIREBASE: const db = getFirestore();
    // FIREBASE: const q = query(collection(db, 'videos'), where('userId', '==', userId));
    
    return this.videos.filter(v => v.userId === userId);
  }

  async submitVideo(userId: string, username: string, challengeId: string, blob: Blob, attemptsUsed: number): Promise<Video> {
    // FIREBASE: Upload to Firebase Storage
    // const storage = getStorage();
    // const storageRef = ref(storage, `videos/${userId}/${Date.now()}.webm`);
    // await uploadBytes(storageRef, blob);
    // const url = await getDownloadURL(storageRef);
    
    const video: Video = {
      id: Date.now().toString(),
      userId,
      username,
      avatar: username.substring(0, 2).toUpperCase(),
      challengeId,
      challengeTitle: this.challenges.find(c => c.id === challengeId)?.title || '',
      url: URL.createObjectURL(blob), // In production, this would be Firebase Storage URL
      vertical: 0, // Will be calculated
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      createdAt: new Date().toISOString(),
      attemptsUsed,
    };

    this.videos.unshift(video);
    
    // FIREBASE: Save to Firestore
    // const db = getFirestore();
    // await addDoc(collection(db, 'videos'), video);
    
    return video;
  }

  async likeVideo(videoId: string): Promise<void> {
    const video = this.videos.find(v => v.id === videoId);
    if (video) {
      video.likes++;
      
      // FIREBASE: Update in Firestore
      // const db = getFirestore();
      // await updateDoc(doc(db, 'videos', videoId), { likes: video.likes });
    }
  }

  hasUserPostedToday(userId: string): boolean {
    const today = new Date().toDateString();
    return this.videos.some(v => 
      v.userId === userId && 
      new Date(v.createdAt).toDateString() === today
    );
  }
}

export const dataService = new MockDataService();
