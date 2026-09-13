import {initializeApp} from 'firebase/app'
import {getAuth} from 'firebase/auth'
import {getFirestore} from 'firebase/firestore'

/**
 * Firebase project configuration for Meme IQ.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyCxmHmqx9OKLbemP8UMXE9wlX8wUmWWoyE',
  authDomain: 'meme-iq.firebaseapp.com',
  projectId: 'meme-iq',
  storageBucket: 'meme-iq.firebasestorage.app',
  messagingSenderId: '92487218396',
  appId: '1:92487218396:web:a65124c521f8bc2af6b019',
  measurementId: 'G-S6DHRYYTYE',
}

export const app = initializeApp(firebaseConfig)
export const firestore = getFirestore(app)
export const auth = getAuth(app)
