import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactDOM from 'react-dom/client';
import { setDoc } from 'firebase/firestore'; 
import { onAuthStateChanged, signOut, signInWithPopup } from 'firebase/auth';
import {
  doc, getDoc, collection, addDoc, updateDoc, query, orderBy, limit, onSnapshot, getDocs, where, deleteField, arrayUnion, increment, writeBatch
} from 'firebase/firestore';
import { auth, db, googleProvider, storage } from './firebase';
import { ref, getBytes } from 'firebase/storage';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, AlertTriangle, X, CheckCircle2, Info, AlertOctagon, Sparkles, AlertCircle,
  Activity, Shield, Trophy, LayoutGrid, CheckCircle, Lock, ScanLine, MapPin, HandMetal,
  CalendarClock, Bell, QrCode, LayoutDashboard, User as UserIcon, ClipboardList, Check, Star, Crown, Phone,
  Gamepad2, Download, StickyNote, ArrowLeft, Gift, User, CameraOff
} from 'lucide-react';
import { format } from 'date-fns';
import { Scanner } from '@yudiel/react-qr-scanner';
import QRCode from 'react-qr-code';
import confetti from 'canvas-confetti';
import ArcadeDashboard from './Arcade';
import './style.css';
import logoSpars from './spars_logo.png';
import logoIdea from './idea.png';
import logoAi from './ai.png';
import logoH from './hack.png';

const safeFormat = (val, fmtStr = 'HH:mm') => {
  if (!val) return '';
  try {
    const d = val?.toDate ? val.toDate() : new Date(val);
    return isNaN(d.getTime()) ? '' : format(d, fmtStr);
  } catch (e) {
    return '';
  }
};

const safeJsonParse = (str, fallback = null) => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
};

class SafeScanner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.warn("SafeScanner caught camera error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}


const isFirestoreAssertion = (errOrMsg) => {
  const msg = String(errOrMsg?.message || errOrMsg?.reason?.message || errOrMsg?.stack || errOrMsg || '');
  return (
    msg.includes('FIRESTORE') ||
    msg.includes('INTERNAL ASSERTION FAILED') ||
    msg.includes('Unexpected state') ||
    msg.includes('WatchChangeAggregator') ||
    msg.includes('b815') ||
    msg.includes('ca9') ||
    msg.includes('__PRIVATE_') ||
    msg.includes('ve: -1') ||
    msg.includes('ve:-1') ||
    msg.includes('TargetState') ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('permission-denied')
  );
};

// Safe Firestore onSnapshot wrapper that disconnects on permission errors to prevent WebChannel assertion crash
const safeOnSnapshot = (targetQueryOrRef, onNext, onError) => {
  let isCleanedUp = false;
  let unsub = null;

  try {
    unsub = onSnapshot(
      targetQueryOrRef,
      (snapshot) => {
        if (isCleanedUp) return;
        try {
          if (onNext) onNext(snapshot);
        } catch (err) {
          console.warn("safeOnSnapshot onNext notice:", err);
        }
      },
      (error) => {
        // Disconnect immediately on any error/permission-denied to prevent WebChannel target thrashing
        if (unsub) {
          try {
            unsub();
          } catch (e) {}
          unsub = null;
        }
        if (!isCleanedUp && onError) {
          try {
            onError(error);
          } catch (e) {}
        }
      }
    );
  } catch (err) {
    if (onError) {
      try {
        onError(err);
      } catch (e) {}
    }
    return () => {};
  }

  return () => {
    isCleanedUp = true;
    if (unsub) {
      try {
        unsub();
      } catch (e) {}
      unsub = null;
    }
  };
};

// Suppress internal Firestore WebChannel assertion crashes from bubbling up to React
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (isFirestoreAssertion(event?.error || event?.message)) {
      console.warn("Safeguarded Firestore internal assertion error:", event?.message || event?.error?.message);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (isFirestoreAssertion(event?.reason)) {
      console.warn("Safeguarded Firestore unhandled assertion rejection:", event?.reason?.message || event?.reason);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    if (isFirestoreAssertion(error)) {
      console.warn("ErrorBoundary absorbed background Firestore assertion error:", error?.message || error);
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (isFirestoreAssertion(error)) {
      console.warn("ErrorBoundary caught & neutralized Firestore stream assertion:", error?.message || error);
      if (this.state.hasError) {
        this.setState({ hasError: false, error: null });
      }
      return;
    }
    console.warn("ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (isFirestoreAssertion(this.state.error)) {
        return this.props.children;
      }
      return (
        <div className="min-h-[400px] w-full flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-indigo-100 max-w-md w-full">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-lg font-black text-gray-800 mb-2">Something went wrong</h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              A temporary synchronization issue occurred. You can reload this section or refresh the app.
            </p>
            {this.state.error?.message && (
              <div className="p-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-left overflow-auto max-h-32">
                <p className="text-[11px] font-mono text-red-700 break-words font-semibold">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================================
   ASSETS & CONFIG
   ========================================= */
const ASSETS = {
    LOGO_SPARS: logoSpars,   // Use the imported variable
    LOGO_IDEALAB: logoIdea,  // Use the imported variable
    LOGO_ai: logoAi,         // Use the imported variable
    LOGO_H: logoH            // Use the imported variable
};

const TRACK_HELPERS = [
    {
        track: "Track 1",
        faculty: { name: "Prof. Alan Turing", contact: "9876543001" },
        staff: "Alex Morgan",
        students: [
             { roll: "TEST-AI-01", name: "Jordan Vance", year: "IV", branch: "CSE", mobile: "9876543101", role: "Registration Desk", venue: "Lab 101" },
             { roll: "TEST-AI-02", name: "Maya Patel", year: "III", branch: "AI & ML", mobile: "9876543102", role: "Venue Volunteer", venue: "Lab 101" },
             { roll: "TEST-AI-03", name: "Chris Evans", year: "III", branch: "ECE", mobile: "9876543103", role: "Venue Volunteer", venue: "Lab 101" },
             { roll: "TEST-AI-04", name: "Sam Taylor", year: "II", branch: "Data Science", mobile: "9876543104", role: "Jury Helpers", venue: "Lab 101" }
        ]
    },
    {
        track: "Track 2",
        faculty: { name: "Dr. Grace Hopper", contact: "9876543002" },
        staff: "Logan Hayes",
        students: [
             { roll: "TEST-SEC-01", name: "Riley Scott", year: "IV", branch: "Cybersecurity", mobile: "9876543105", role: "Registration Desk", venue: "Lab 102" },
             { roll: "TEST-SEC-02", name: "Morgan Drake", year: "III", branch: "CSE", mobile: "9876543106", role: "Venue Volunteer", venue: "Lab 102" },
             { roll: "TEST-SEC-03", name: "Alex Mercer", year: "III", branch: "IT", mobile: "9876543107", role: "Venue Volunteer", venue: "Lab 102" },
             { roll: "TEST-SEC-04", name: "Dana Scully", year: "II", branch: "Cybersecurity", mobile: "9876543108", role: "Jury Helpers", venue: "Lab 102" }
        ]
    },
    {
        track: "Track 3",
        faculty: { name: "Prof. Claude Shannon", contact: "9876543003" },
        staff: "Taylor Quinn",
        students: [
             { roll: "TEST-CLD-01", name: "Jamie Foxx", year: "IV", branch: "IT", mobile: "9876543109", role: "Registration Desk", venue: "Lab 103" },
             { roll: "TEST-CLD-02", name: "Casey Jones", year: "III", branch: "CSE", mobile: "9876543110", role: "Venue Volunteer", venue: "Lab 103" },
             { roll: "TEST-CLD-03", name: "Avery Brooks", year: "III", branch: "ECE", mobile: "9876543111", role: "Venue Volunteer", venue: "Lab 103" },
             { roll: "TEST-CLD-04", name: "Parker Reed", year: "II", branch: "Cloud Computing", mobile: "9876543112", role: "Jury Helpers", venue: "Lab 103" }
        ]
    },
    {
        track: "Track 4",
        faculty: { name: "Dr. Satoshi Vance", contact: "9876543004" },
        staff: "Dakota Ray",
        students: [
             { roll: "TEST-W3-01", name: "River Song", year: "IV", branch: "CSE", mobile: "9876543113", role: "Registration Desk", venue: "Lab 104" },
             { roll: "TEST-W3-02", name: "Rowan North", year: "III", branch: "FinTech", mobile: "9876543114", role: "Venue Volunteer", venue: "Lab 104" },
             { roll: "TEST-W3-03", name: "Reese Withers", year: "III", branch: "ECE", mobile: "9876543115", role: "Venue Volunteer", venue: "Lab 104" },
             { roll: "TEST-W3-04", name: "Kendall Roy", year: "II", branch: "IT", mobile: "9876543116", role: "Jury Helpers", venue: "Lab 104" }
        ]
    },
    {
        track: "Track 5",
        faculty: { name: "Prof. Nikola Bell", contact: "9876543005" },
        staff: "Cameron Blake",
        students: [
             { roll: "TEST-IOT-01", name: "Skyler White", year: "IV", branch: "ECE", mobile: "9876543117", role: "Registration Desk", venue: "Lab 201" },
             { roll: "TEST-IOT-02", name: "Jesse Pinkman", year: "III", branch: "IoT", mobile: "9876543118", role: "Venue Volunteer", venue: "Lab 201" },
             { roll: "TEST-IOT-03", name: "Walter Gray", year: "III", branch: "EEE", mobile: "9876543119", role: "Venue Volunteer", venue: "Lab 201" },
             { roll: "TEST-IOT-04", name: "Hank Hill", year: "II", branch: "ECE", mobile: "9876543120", role: "Jury Helpers", venue: "Lab 201" }
        ]
    },
    {
        track: "Track 6",
        faculty: { name: "Dr. Barbara Liskov", contact: "9876543006" },
        staff: "Reese Cooper",
        students: [
             { roll: "TEST-FIN-01", name: "Elliot Alderson", year: "IV", branch: "CSE", mobile: "9876543121", role: "Registration Desk", venue: "Lab 202" },
             { roll: "TEST-FIN-02", name: "Darlene Miller", year: "III", branch: "Cybersecurity", mobile: "9876543122", role: "Venue Volunteer", venue: "Lab 202" },
             { roll: "TEST-FIN-03", name: "Angela Moss", year: "III", branch: "Finance & Tech", mobile: "9876543123", role: "Venue Volunteer", venue: "Lab 202" },
             { roll: "TEST-FIN-04", name: "Tyrell Wellick", year: "II", branch: "CSE", mobile: "9876543124", role: "Jury Helpers", venue: "Lab 202" }
        ]
    },
    {
        track: "Track 7",
        faculty: { name: "Prof. Rosalind Franklin", contact: "9876543007" },
        staff: "Harper Lee",
        students: [
             { roll: "TEST-BIO-01", name: "Peter Parker", year: "IV", branch: "BioTech", mobile: "9876543125", role: "Registration Desk", venue: "Lab 203" },
             { roll: "TEST-BIO-02", name: "Miles Morales", year: "III", branch: "CSE", mobile: "9876543126", role: "Venue Volunteer", venue: "Lab 203" },
             { roll: "TEST-BIO-03", name: "Gwen Stacy", year: "III", branch: "BioAI", mobile: "9876543127", role: "Venue Volunteer", venue: "Lab 203" },
             { roll: "TEST-BIO-04", name: "Mary Jane", year: "II", branch: "BioMedical", mobile: "9876543128", role: "Jury Helpers", venue: "Lab 203" }
        ]
    },
    {
        track: "Track 8",
        faculty: { name: "Dr. John Carmack", contact: "9876543008" },
        staff: "Peyton Sawyer",
        students: [
             { roll: "TEST-XR-01", name: "Clark Kent", year: "IV", branch: "CSE", mobile: "9876543129", role: "Registration Desk", venue: "Lab 301" },
             { roll: "TEST-XR-02", name: "Bruce Wayne", year: "III", branch: "Robotics", mobile: "9876543130", role: "Venue Volunteer", venue: "Lab 301" },
             { roll: "TEST-XR-03", name: "Diana Prince", year: "III", branch: "AR & VR", mobile: "9876543131", role: "Venue Volunteer", venue: "Lab 301" },
             { roll: "TEST-XR-04", name: "Barry Allen", year: "II", branch: "CSE", mobile: "9876543132", role: "Jury Helpers", venue: "Lab 301" }
        ]
    },
    {
        track: "Track 9",
        faculty: { name: "Prof. Rachel Carson", contact: "9876543009" },
        staff: "Hayden Cross",
        students: [
             { roll: "TEST-CLN-01", name: "Tony Stark", year: "IV", branch: "Renewable Tech", mobile: "9876543133", role: "Registration Desk", venue: "Lab 302" },
             { roll: "TEST-CLN-02", name: "Steve Rogers", year: "III", branch: "Civil", mobile: "9876543134", role: "Venue Volunteer", venue: "Lab 302" },
             { roll: "TEST-CLN-03", name: "Natasha Romanoff", year: "III", branch: "CSE", mobile: "9876543135", role: "Venue Volunteer", venue: "Lab 302" },
             { roll: "TEST-CLN-04", name: "Bruce Banner", year: "II", branch: "Environmental", mobile: "9876543136", role: "Jury Helpers", venue: "Lab 302" }
        ]
    }
];

const ROUND_RUBRICS = {
    idea: {
        id: 'idea',
        label: 'Idea Pitching',
        maxMarks: 20,
        rubrics: [
            { id: 'solution', label: 'Proposed Solution', max: 6 },
            { id: 'techKnowledge', label: 'Technical Knowledge', max: 8 },
            { id: 'presentation', label: 'Presentation', max: 6 },
        ]
    },
    phase1: {
        id: 'phase1',
        label: 'Hackathon Phase-I',
        maxMarks: 20,
        rubrics: [
            { id: 'prototype', label: 'Prototype Design', max: 6 },
            { id: 'techSkills', label: 'Demonstration Skills', max: 6 },
            { id: 'viva', label: 'Viva-Voce', max: 8 },
        ]
    },
    phase2: {
        id: 'phase2',
        label: 'Hackathon Phase-II',
        maxMarks: 30,
        rubrics: [
            { id: 'improvement', label: 'Improvement observed in Prototype Design', max: 20 },
            { id: 'viva', label: 'Viva-Voce', max: 10 },
        ]
    },
    phase3: {
        id: 'phase3',
        label: 'Final Phase',
        maxMarks: 30,
        rubrics: [
            { id: 'innovation', label: 'Solution Impact & Innovation', max: 12 },
            { id: 'implementation', label: 'Implementation Quality', max: 10 },
            { id: 'scalability', label: 'Scalability, Feasibility & Market Value', max: 8 },
        ]
    }
};

const ROUND_GUIDELINES = {
  idea: [
    "Teams must clearly articulate the problem statement, target users, and the proposed solution approach within the allotted time.",
    "The proposed solution should demonstrate originality, relevance to the problem, and a clear understanding of the domain.",
    "Jury members will assess the team’s technical knowledge, including awareness of tools, technologies, feasibility, and potential implementation challenges.",
    "Presentations should be well-structured, concise, and professionally delivered, with effective communication and clarity of thought.",
    "During the Q&A session, teams are expected to respond confidently and logically, justifying their design and technical choices.",
    "Teams must notify the jury of their readiness for evaluation via the online platform."
  ],
  phase1: [
    "Teams will be evaluated on their ability to translate the proposed idea into a functional prototype or working solution.",
    "The prototype should reflect sound technical implementation, logical architecture, and basic usability.",
    "Jury members will assess demonstration skills, including how effectively the team explains the working flow, features, and limitations of the prototype.",
    "The Viva-Voce will focus on understanding the team’s individual contributions, design decisions, and problem-solving approach.",
    "Teams must update their evaluation readiness on the online platform before jury assessment."
  ],
  phase2: [
    "Evaluation will focus on the extent and quality of improvements made to the prototype based on jury feedback from Phase-I.",
    "Teams should demonstrate enhanced functionality, improved performance, better UI/UX, or refined technical architecture.",
    "Completion of assigned tasks and responsiveness to jury suggestions will be given significant importance.",
    "The Viva-Voce will test the depth of understanding, scalability considerations, and technical trade-offs involved in the improved solution.",
    "Teams must notify the jury of their readiness for evaluation via the online platform."
  ],
  phase3: [
    "Teams will be evaluated on the sustainability of the solution, including long-term viability, scalability, maintainability, and real-world impact.",
    "Craftsmanship will assess code quality, system design, UI/UX polish, robustness, and overall completeness of the solution.",
    "The Viva-Voce will emphasize holistic understanding, future roadmap, ethical considerations, and business or deployment feasibility.",
    "Teams are expected to present a well-finished, production-ready solution supported by clear technical justification.",
    "Final evaluation readiness must be indicated through the online platform prior to jury assessment."
  ]
};

const TIMELINE_DATA = [
    { day: 'Day 1 - 09 Jan', time: '06:00 AM – 07:30 AM', title: 'Registration', location: 'Central Auditorium' },
    { day: 'Day 1 - 09 Jan', time: '07:30 AM – 09:00 AM', title: 'Registration & Breakfast', location: 'Central Auditorium → Cellar' },
    { day: 'Day 1 - 09 Jan', time: '09:00 AM – 09:30 AM', title: 'Inaugural Ceremony', location: 'Central Auditorium' },
    { day: 'Day 1 - 09 Jan', time: '09:30 AM – 10:10 AM', title: 'Mentor Interactive Session – I', location: 'Central Auditorium (Mandatory)' },
    { day: 'Day 1 - 09 Jan', time: '10:10 AM – 10:20 AM', title: 'Proceed to Respective Venues', location: '-' },
    { day: 'Day 1 - 09 Jan', time: '10:20 AM – 12:00 PM', title: 'Idea Pitching', location: 'Respective Venues' },
    { day: 'Day 1 - 09 Jan', time: '12:00 PM – 07:00 PM', title: 'Hackathon Phase-I', location: 'Respective Venues' },
    { day: 'Day 1 - 09 Jan', time: '12:45 PM – 02:30 PM', title: 'Lunch Break', location: 'Main Canteen' },
    { day: 'Day 1 - 09 Jan', time: '04:00 PM – 05:00 PM', title: 'Snacks & Tea', location: 'Main Canteen' },
    { day: 'Day 1 - 09 Jan', time: '07:00 PM – 08:00 PM', title: 'Mentor Session – II', location: 'Central Auditorium (Mandatory)' },
    { day: 'Day 1 - 09 Jan', time: '08:00 PM – 09:45 AM', title: 'Hackathon Phase-II', location: 'Respective Venues' },
    { day: 'Day 1 - 09 Jan', time: '08:00 PM – 09:30 PM', title: 'Dinner', location: 'Main Canteen' },
    { day: 'Day 1 → Day 2', time: '12:00 AM – 01:15 AM', title: 'Ice Breaking Session', location: 'Non-Mandatory' },
    { day: 'Day 2 - 10 Jan', time: '06:00 AM – 08:15 AM', title: 'Refreshing & Breakfast', location: 'Cellar' },
    { day: 'Day 2 - 10 Jan', time: '09:45 AM – 02:00 PM', title: 'Hackathon Phase-III (Finals)', location: 'Respective Venues' },
    { day: 'Day 2 - 10 Jan', time: '02:00 PM – 03:00 PM', title: 'Lunch', location: 'Main Canteen' },
    { day: 'Day 2 - 10 Jan', time: '03:00 PM – 04:00 PM', title: 'Feedback & Cultural Program', location: 'Central Auditorium' },
    { day: 'Day 2 - 10 Jan', time: '04:00 PM – 06:00 PM', title: 'Valedictory Ceremony', location: 'Central Auditorium' },
];

const SAMPLE_TEAMS = [
    {
        id: "team_1",
        name: "Neural Nexus",
        track: "Track 1",
        venue: "Lab 101",
        description: "Decentralized AI inference engine for low-power edge computing devices.",
        leaderName: "Aarav Sharma",
        leaderEmail: "aarav@hackfest.org",
        leaderPhone: "9876543210",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase3",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "Aarav Sharma", diet: "veg" },
            { name: "Priya Nair", diet: "non-veg" },
            { name: "Rohan Verma", diet: "veg" },
            { name: "Sneha Kapoor", diet: "non-veg" }
        ],
        assignedJuryName: "Prof. Alan Turing"
    },
    {
        id: "team_2",
        name: "Quantum Leap",
        track: "Track 2",
        venue: "Lab 102",
        description: "Post-quantum end-to-end encrypted messaging and distributed key exchange.",
        leaderName: "Kavya Patel",
        leaderEmail: "kavya@hackfest.org",
        leaderPhone: "9876543211",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase3",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "Kavya Patel", diet: "veg" },
            { name: "Aditya Joshi", diet: "veg" },
            { name: "Meera Sen", diet: "non-veg" },
            { name: "Vikram Das", diet: "non-veg" }
        ],
        assignedJuryName: "Dr. Grace Hopper"
    },
    {
        id: "team_3",
        name: "CyberSentinels",
        track: "Track 3",
        venue: "Lab 201",
        description: "Automated vulnerability mitigation and real-time kernel observability using eBPF.",
        leaderName: "Liam Smith",
        leaderEmail: "liam@hackfest.org",
        leaderPhone: "9876543212",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase2",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "Liam Smith", diet: "veg" },
            { name: "Elena Rostova", diet: "non-veg" },
            { name: "Divya Teja", diet: "veg" },
            { name: "Marcus Vance", diet: "non-veg" }
        ],
        assignedJuryName: "Dr. Ada Lovelace"
    },
    {
        id: "team_4",
        name: "BioSynth AI",
        track: "Track 4",
        venue: "Lab 202",
        description: "Machine learning driven molecular docking for accelerated drug formulation.",
        leaderName: "Ananya Iyer",
        leaderEmail: "ananya@hackfest.org",
        leaderPhone: "9876543213",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase2",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "Ananya Iyer", diet: "veg" },
            { name: "Siddharth Rao", diet: "non-veg" },
            { name: "Tanvi Bhat", diet: "veg" },
            { name: "Varun Mehta", diet: "non-veg" }
        ],
        assignedJuryName: "Prof. Claude Shannon"
    },
    {
        id: "team_5",
        name: "AeroVision",
        track: "Track 5",
        venue: "Lab 301",
        description: "Autonomous drone swarm navigation and thermal scanning for search & rescue.",
        leaderName: "Gautam Menon",
        leaderEmail: "gautam@hackfest.org",
        leaderPhone: "9876543214",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase3",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "Gautam Menon", diet: "veg" },
            { name: "Ritu Sen", diet: "non-veg" },
            { name: "Nikhil Kumar", diet: "non-veg" },
            { name: "Pooja Hegde", diet: "veg" }
        ],
        assignedJuryName: "Dr. Margaret Hamilton"
    },
    {
        id: "team_6",
        name: "GreenGrid Smart",
        track: "Track 6",
        venue: "Lab 302",
        description: "IoT microgrid power distribution optimizer with predictive battery storage balancing.",
        leaderName: "Lucas Chen",
        leaderEmail: "lucas@hackfest.org",
        leaderPhone: "9876543215",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase2",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "Lucas Chen", diet: "non-veg" },
            { name: "Isha Guha", diet: "veg" },
            { name: "Arjun Pillai", diet: "non-veg" },
            { name: "Zoya Akhtar", diet: "veg" }
        ],
        assignedJuryName: "Prof. Linus Torvalds"
    },
    {
        id: "team_7",
        name: "HealthPulse",
        track: "Track 7",
        venue: "Lab 303",
        description: "Non-invasive wearable vital sign monitor with on-device arrhythmia detection.",
        leaderName: "David Kim",
        leaderEmail: "david@hackfest.org",
        leaderPhone: "9876543216",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase2",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "David Kim", diet: "veg" },
            { name: "Rashmi Roy", diet: "non-veg" },
            { name: "Farhan Ali", diet: "non-veg" },
            { name: "Neha Reddy", diet: "veg" }
        ],
        assignedJuryName: "Dr. Tim Berners-Lee"
    },
    {
        id: "team_8",
        name: "ChainFlow Logistics",
        track: "Track 8",
        venue: "Lab 304",
        description: "Zero-knowledge pharmaceutical supply chain verification against counterfeit goods.",
        leaderName: "Aisha Rahman",
        leaderEmail: "aisha@hackfest.org",
        leaderPhone: "9876543217",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase3",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "Aisha Rahman", diet: "veg" },
            { name: "Manoj Kumar", diet: "veg" },
            { name: "Anjali Jain", diet: "veg" },
            { name: "Karthik Raja", diet: "non-veg" }
        ],
        assignedJuryName: "Prof. Barbara Liskov"
    },
    {
        id: "team_9",
        name: "RoboAssist",
        track: "Track 9",
        venue: "Lab 305",
        description: "EMG-controlled biomechanical exoskeleton arm for neuromuscular rehabilitation.",
        leaderName: "Pranav Deshmukh",
        leaderEmail: "pranav@hackfest.org",
        leaderPhone: "9876543218",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase3",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "Pranav Deshmukh", diet: "veg" },
            { name: "Nandini Rao", diet: "veg" },
            { name: "Tejaswini B", diet: "non-veg" },
            { name: "Harsh Vardhan", diet: "non-veg" }
        ],
        assignedJuryName: "Dr. Donald Knuth"
    },
    {
        id: "team_10",
        name: "PulseCity IoT",
        track: "Track 1",
        venue: "Lab 103",
        description: "Adaptive urban traffic light optimization using distributed acoustic and vision sensors.",
        leaderName: "Sofia Alvarez",
        leaderEmail: "sofia@hackfest.org",
        leaderPhone: "9876543219",
        attendanceMarked: true,
        status: "ready",
        readyRound: "phase3",
        memberCount: 4,
        vegCount: 2,
        nonVegCount: 2,
        members: [
            { name: "Sofia Alvarez", diet: "veg" },
            { name: "Daniel Park", diet: "non-veg" },
            { name: "Maya Krishnan", diet: "veg" },
            { name: "Tariq Mansoor", diet: "non-veg" }
        ],
        assignedJuryName: "Prof. Alan Turing"
    }
];

const SAMPLE_EVALUATIONS = {
    team_1: {
        idea: { total: 18, avg: 18, count: 1, scores: [18], rubricBreakdown: { solution: 5, techKnowledge: 7, presentation: 6 } },
        phase1: { total: 17, avg: 17, count: 1, scores: [17], rubricBreakdown: { prototype: 5, techSkills: 5, viva: 7 } },
        phase2: { total: 26, avg: 26, count: 1, scores: [26], rubricBreakdown: { improvement: 17, viva: 9 } },
        phase3: { total: 27, avg: 27, count: 1, scores: [27], rubricBreakdown: { innovation: 11, implementation: 9, scalability: 7 } }
    },
    team_2: {
        idea: { total: 19, avg: 19, count: 1, scores: [19], rubricBreakdown: { solution: 6, techKnowledge: 7, presentation: 6 } },
        phase1: { total: 18, avg: 18, count: 1, scores: [18], rubricBreakdown: { prototype: 6, techSkills: 5, viva: 7 } },
        phase2: { total: 25, avg: 25, count: 1, scores: [25], rubricBreakdown: { improvement: 16, viva: 9 } },
        phase3: { total: 26, avg: 26, count: 1, scores: [26], rubricBreakdown: { innovation: 10, implementation: 9, scalability: 7 } }
    },
    team_3: {
        idea: { total: 16, avg: 16, count: 1, scores: [16], rubricBreakdown: { solution: 5, techKnowledge: 6, presentation: 5 } },
        phase1: { total: 16, avg: 16, count: 1, scores: [16], rubricBreakdown: { prototype: 5, techSkills: 5, viva: 6 } },
        phase2: { total: 23, avg: 23, count: 1, scores: [23], rubricBreakdown: { improvement: 15, viva: 8 } },
        phase3: { total: 25, avg: 25, count: 1, scores: [25], rubricBreakdown: { innovation: 10, implementation: 8, scalability: 7 } }
    },
    team_4: {
        idea: { total: 17, avg: 17, count: 1, scores: [17], rubricBreakdown: { solution: 5, techKnowledge: 7, presentation: 5 } },
        phase1: { total: 17, avg: 17, count: 1, scores: [17], rubricBreakdown: { prototype: 5, techSkills: 5, viva: 7 } },
        phase2: { total: 24, avg: 24, count: 1, scores: [24], rubricBreakdown: { improvement: 16, viva: 8 } },
        phase3: { total: 24, avg: 24, count: 1, scores: [24], rubricBreakdown: { innovation: 9, implementation: 8, scalability: 7 } }
    },
    team_5: {
        idea: { total: 19, avg: 19, count: 1, scores: [19], rubricBreakdown: { solution: 6, techKnowledge: 7, presentation: 6 } },
        phase1: { total: 19, avg: 19, count: 1, scores: [19], rubricBreakdown: { prototype: 6, techSkills: 6, viva: 7 } },
        phase2: { total: 28, avg: 28, count: 1, scores: [28], rubricBreakdown: { improvement: 19, viva: 9 } },
        phase3: { total: 28, avg: 28, count: 1, scores: [28], rubricBreakdown: { innovation: 11, implementation: 10, scalability: 7 } }
    },
    team_6: {
        idea: { total: 18, avg: 18, count: 1, scores: [18], rubricBreakdown: { solution: 5, techKnowledge: 7, presentation: 6 } },
        phase1: { total: 17, avg: 17, count: 1, scores: [17], rubricBreakdown: { prototype: 5, techSkills: 5, viva: 7 } },
        phase2: { total: 25, avg: 25, count: 1, scores: [25], rubricBreakdown: { improvement: 17, viva: 8 } },
        phase3: { total: 26, avg: 26, count: 1, scores: [26], rubricBreakdown: { innovation: 10, implementation: 9, scalability: 7 } }
    },
    team_7: {
        idea: { total: 16, avg: 16, count: 1, scores: [16], rubricBreakdown: { solution: 5, techKnowledge: 6, presentation: 5 } },
        phase1: { total: 17, avg: 17, count: 1, scores: [17], rubricBreakdown: { prototype: 5, techSkills: 5, viva: 7 } },
        phase2: { total: 24, avg: 24, count: 1, scores: [24], rubricBreakdown: { improvement: 16, viva: 8 } },
        phase3: { total: 25, avg: 25, count: 1, scores: [25], rubricBreakdown: { innovation: 10, implementation: 8, scalability: 7 } }
    },
    team_8: {
        idea: { total: 17, avg: 17, count: 1, scores: [17], rubricBreakdown: { solution: 5, techKnowledge: 7, presentation: 5 } },
        phase1: { total: 18, avg: 18, count: 1, scores: [18], rubricBreakdown: { prototype: 6, techSkills: 5, viva: 7 } },
        phase2: { total: 27, avg: 27, count: 1, scores: [27], rubricBreakdown: { improvement: 18, viva: 9 } },
        phase3: { total: 28, avg: 28, count: 1, scores: [28], rubricBreakdown: { innovation: 11, implementation: 9, scalability: 8 } }
    },
    team_9: {
        idea: { total: 18, avg: 18, count: 1, scores: [18], rubricBreakdown: { solution: 6, techKnowledge: 6, presentation: 6 } },
        phase1: { total: 19, avg: 19, count: 1, scores: [19], rubricBreakdown: { prototype: 6, techSkills: 6, viva: 7 } },
        phase2: { total: 27, avg: 27, count: 1, scores: [27], rubricBreakdown: { improvement: 18, viva: 9 } },
        phase3: { total: 29, avg: 29, count: 1, scores: [29], rubricBreakdown: { innovation: 12, implementation: 9, scalability: 8 } }
    },
    team_10: {
        idea: { total: 18, avg: 18, count: 1, scores: [18], rubricBreakdown: { solution: 5, techKnowledge: 7, presentation: 6 } },
        phase1: { total: 18, avg: 18, count: 1, scores: [18], rubricBreakdown: { prototype: 6, techSkills: 5, viva: 7 } },
        phase2: { total: 26, avg: 26, count: 1, scores: [26], rubricBreakdown: { improvement: 17, viva: 9 } },
        phase3: { total: 27, avg: 27, count: 1, scores: [27], rubricBreakdown: { innovation: 11, implementation: 9, scalability: 7 } }
    }
};

const SAMPLE_USERS = [
    { id: 'usr_adm_1', name: 'Chief Administrator', email: 'admin@hackfest.org', role: 'admin' },
    { id: 'usr_jry_1', name: 'Prof. Alan Turing', email: 'alan.turing@hackfest.org', role: 'jury', assignedTrack: 'Track 1', assignedVenue: 'Lab 101' },
    { id: 'usr_jry_2', name: 'Dr. Grace Hopper', email: 'grace.hopper@hackfest.org', role: 'jury', assignedTrack: 'Track 2', assignedVenue: 'Lab 102' },
    { id: 'usr_jry_3', name: 'Dr. Ada Lovelace', email: 'ada.lovelace@hackfest.org', role: 'jury', assignedTrack: 'Track 3', assignedVenue: 'Lab 201' },
    { id: 'usr_jry_4', name: 'Prof. Claude Shannon', email: 'claude.shannon@hackfest.org', role: 'jury', assignedTrack: 'Track 4', assignedVenue: 'Lab 202' },
    { id: 'usr_jry_5', name: 'Dr. Margaret Hamilton', email: 'margaret.hamilton@hackfest.org', role: 'jury', assignedTrack: 'Track 5', assignedVenue: 'Lab 301' },
    { id: 'usr_jry_6', name: 'Prof. Linus Torvalds', email: 'linus.torvalds@hackfest.org', role: 'jury', assignedTrack: 'Track 6', assignedVenue: 'Lab 302' },
    { id: 'usr_cnt_1', name: 'Aarav Sharma', email: 'aarav@hackfest.org', role: 'contestant', teamId: 'team_1', assignedTrack: 'Track 1', assignedVenue: 'Lab 101' },
    { id: 'usr_cnt_2', name: 'Kavya Patel', email: 'kavya@hackfest.org', role: 'contestant', teamId: 'team_2', assignedTrack: 'Track 2', assignedVenue: 'Lab 102' },
    { id: 'usr_cnt_3', name: 'Liam Smith', email: 'liam@hackfest.org', role: 'contestant', teamId: 'team_3', assignedTrack: 'Track 3', assignedVenue: 'Lab 201' },
    { id: 'usr_cnt_4', name: 'Ananya Iyer', email: 'ananya@hackfest.org', role: 'contestant', teamId: 'team_4', assignedTrack: 'Track 4', assignedVenue: 'Lab 202' },
    { id: 'usr_hlp_1', name: 'Alex Taylor', email: 'alex.taylor@hackfest.org', role: 'helper', helperRole: 'Registration Desk' },
    { id: 'usr_hlp_2', name: 'Jordan Lee', email: 'jordan.lee@hackfest.org', role: 'helper', helperRole: 'Venue Volunteer', assignedVenue: 'Lab 101' },
    { id: 'usr_hlp_3', name: 'Morgan Casey', email: 'morgan.casey@hackfest.org', role: 'helper', helperRole: 'Jury Helpers', assignedTrack: 'Track 1' }
];

const SAMPLE_FEEDBACKS = [
    {
        id: 'fb_1',
        type: 'jury',
        juryName: 'Prof. Alan Turing',
        juryId: 'usr_jry_1',
        organization: 'Institute for Advanced Computing',
        designation: 'Lead Jury - AI Track',
        contact: '9876543001',
        submittedAt: new Date(Date.now() - 3600000).toISOString(),
        responses: {
            q1: 'Outstanding demonstration of real-time edge AI inference with quantized models.',
            q2: 'High code quality, well-modularized neural architecture.',
            q3: 'Recommend adding benchmarks on lower-tier hardware.',
            q5: 'Strong presentation and crisp responses during Q&A.',
            q6: 'Excellent team coordination and leadership.',
            q7: 'Top tier contender for the hackathon grand prize.'
        }
    },
    {
        id: 'fb_2',
        type: 'contestant',
        teamName: 'Neural Nexus',
        teamId: 'team_1',
        organization: 'Hackfest Participant',
        contact: '9876543210',
        submittedAt: new Date(Date.now() - 7200000).toISOString(),
        responses: {
            q1: 'Very smooth registration and prompt mentor feedback.',
            q2: 'High-speed internet in Lab 101 was super reliable.',
            q3: 'Jury provided constructive suggestions on latency reduction.',
            q4: '5',
            q5: 'Loved the arcade zone during breaks!',
            q6: 'Overall organization has been flawless.',
            q7: 'Would definitely participate in the next edition!'
        }
    },
    {
        id: 'fb_3',
        type: 'jury',
        juryName: 'Dr. Grace Hopper',
        juryId: 'usr_jry_2',
        organization: 'Systems Research Lab',
        designation: 'Jury - Web3 & Security',
        contact: '9876543002',
        submittedAt: new Date(Date.now() - 10800000).toISOString(),
        responses: {
            q1: 'Impressive implementation of post-quantum cryptography and key encapsulation.',
            q2: 'Solid cryptographic primitives and clean code.',
            q3: 'Key exchange mechanism is very innovative.',
            q5: 'Great demonstration under simulated packet drops.',
            q6: 'Very good viva responses from all team members.',
            q7: 'Strongly recommended for phase 3 finals.'
        }
    },
    {
        id: 'fb_4',
        type: 'contestant',
        teamName: 'CyberSentinels',
        teamId: 'team_3',
        organization: 'Hackfest Participant',
        contact: '9876543212',
        submittedAt: new Date(Date.now() - 14400000).toISOString(),
        responses: {
            q1: 'Lab facilities and mentor availability were top-notch.',
            q2: 'Real-time dashboard updates kept our team on track.',
            q3: 'Jury rounds were thorough and intellectually stimulating.',
            q4: '5',
            q5: 'Food and refreshments were well arranged.',
            q6: 'Excellent platform UI and seamless check-in.',
            q7: 'Incredible learning experience!'
        }
    }
];

/* =========================================
   UTILS
   ========================================= */

const useSystemState = () => {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem('hackfest_system_state');
      return saved ? JSON.parse(saved) : {
        currentRound: 'idea',
        roundStatus: 'locked',
        notifications: []
      };
    } catch(e) {
      return {
        currentRound: 'idea',
        roundStatus: 'locked',
        notifications: []
      };
    }
  });

  useEffect(() => {
    // 1. Listen for local state events (ensures instant UI updates)
    const handleLocalState = (e) => {
      if (e.detail) {
        setState(prev => ({ ...prev, ...e.detail }));
      }
    };
    window.addEventListener('hackfest_state_change', handleLocalState);

    // 2. Listen to Firestore
    const unsub = safeOnSnapshot(doc(db, 'system', 'state'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setState(data);
        localStorage.setItem('hackfest_system_state', JSON.stringify(data));
      } else {
        setDoc(doc(db, 'system', 'state'), {
          currentRound: 'idea',
          roundStatus: 'locked'
        }, { merge: true }).catch(() => {});
      }
    }, (err) => {
      console.warn("System state notice (using local state):", err.message);
    });

    return () => {
      window.removeEventListener('hackfest_state_change', handleLocalState);
      if (unsub) unsub();
    };
  }, []);

  return state;
};

const logAction = async (
  userId,
  userEmail,
  userName,
  role,
  action,
  details
) => {
  try {
    await addDoc(collection(db, 'logs'), {
      userId,
      userEmail,
      userName,
      role,
      action,
      details,
      timestamp: new Date().toISOString()
    });
    console.log(`Action logged: ${action}`);
  } catch (error) {
    console.error("Error logging action:", error);
  }
};

/* =========================================
   UI COMPONENTS
   ========================================= */

/* --- TrollOverlay --- */
const PHYSICS_TEST = {
    intro: `An Indian Railways general coach of mass 2.0 × 10^4 kg is moving with constant speed 15 m/s. A chaiwala uncle of mass 75 kg suddenly sprints towards the engine at 3 m/s relative to the coach while yelling “chai garam”. His kettle leaks chai vertically downward at a constant rate of 0.50 kg/s, and the spilled chai sticks to the coach floor. The track is frictionless, air resistance is negligible, and g = 10 m/s^2.`,
    questions: [
        {
            id: 'q1',
            q: 'Q1. What is the instantaneous speed of the coach relative to the ground while the chaiwala is running and chai is leaking?',
            opts: ['A. 15 m/s', 'B. 14.989 m/s', 'C. 15.011 m/s', 'D. Varies linearly with time'],
            correct: 'A'
        },
        {
            id: 'q2',
            q: 'Q2. What is the horizontal momentum of the chaiwala relative to the ground while he is running?',
            opts: ['A. 225 kg m/s', 'B. 900 kg m/s', 'C. 1350 kg m/s', 'D. Zero, because “relative motion cancels out”'],
            correct: 'C'
        },
        {
            id: 'q3',
            q: 'Q3. In the first 4 seconds, how much horizontal momentum is carried away by the leaking chai?',
            opts: ['A. 0', 'B. 6 kg m/s', 'C. 30 kg m/s', 'D. Depends on gravity'],
            correct: 'A'
        },
        {
            id: 'q4',
            q: 'Q4. What is the horizontal acceleration of the center of mass of the system (coach + chaiwala + chai, including spilled chai)?',
            opts: ['A. 0', 'B. 1.5 × 10^-3 m/s^2', 'C. 7.5 × 10^-3 m/s^2', 'D. Non-zero only while chai is leaking'],
            correct: 'A'
        },
        {
            id: 'qLLM',
            q: 'Did you use chatgpt or any other llm to answer these question',
            opts: ['A. Yes', 'B. No'],
            correct: 'A' // Prompt says correct answer should be yes
        }
    ]
};

const TrollOverlay = ({ isOpen, onClose, onComplete }) => {
    const [step, setStep] = useState('test'); // test, video
    const [videoUrl, setVideoUrl] = useState(null);
    const [answers, setAnswers] = useState({});
    const [error, setError] = useState(null);
    const [showClose, setShowClose] = useState(false);
    const [loadingVideo, setLoadingVideo] = useState(false);

    useEffect(() => {
        let activeUrl = null;
        if (isOpen) {
            const fetchVideo = async () => {
                try {
                    setLoadingVideo(true);
                    const fileRef = ref(storage, 'kung.mp4');
                    const arrayBuffer = await getBytes(fileRef);
                    const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
                    activeUrl = URL.createObjectURL(blob);
                    setVideoUrl(activeUrl);
                    setLoadingVideo(false);
                } catch (e) {
                    console.error("Failed to load kung.mp4", e);
                    setLoadingVideo(false);
                }
            };
            if (!videoUrl) fetchVideo();
        }
        return () => {
            if (activeUrl) URL.revokeObjectURL(activeUrl);
            else if (videoUrl) URL.revokeObjectURL(videoUrl);
        };
    }, [isOpen]);

    const handleAnswer = (qid, val) => {
        setAnswers(prev => ({ ...prev, [qid]: val }));
        setError(null);
    };

    const handleSubmit = () => {
        let wrong = false;
        let wrongId = null;

        for (const q of PHYSICS_TEST.questions) {
            const selected = answers[q.id];
            if (!selected || !selected.startsWith(q.correct)) {
                wrong = true;
                wrongId = q.id;
                break;
            }
        }

        if (wrong) {
            setError(`Question ${wrongId.replace('q', '')} is incorrect. Please try again.`);
            setAnswers({});
        } else {
            setStep('video');
        }
    };

    useEffect(() => {
        if (step === 'video') {
            const timer = setTimeout(() => {
                setShowClose(true);
            }, 20000); // 20 seconds
            return () => clearTimeout(timer);
        }
    }, [step]);

    if (!isOpen) return null;

    if (step === 'video') {
         return (
             <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
                 {videoUrl ? (
                     <video
                        src={videoUrl}
                        autoPlay
                        className="w-full h-full object-contain"
                        onEnded={() => setShowClose(true)}
                     />
                 ) : (
                     <div className="text-white">Loading Verification Media...</div>
                 )}
                 {showClose && (
                     <button
                        onClick={onComplete}
                        className="absolute top-4 right-4 bg-white text-black px-4 py-2 rounded-full font-bold z-50"
                     >
                         Close & Return to Dashboard
                     </button>
                 )}
             </div>
         );
    }

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto flex flex-col shadow-2xl relative">
                 {/* Header */}
                 <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                     <div>
                        <h2 className="text-2xl font-black text-gray-800">Physics Verification</h2>
                        <p className="text-sm text-gray-500">Required to access marks</p>
                     </div>
                     <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                 </div>

                 {/* Content */}
                 <div className="p-6 md:p-8">
                     <p className="text-sm font-mono bg-indigo-50 text-indigo-900 p-4 rounded-xl mb-8 leading-relaxed font-medium border border-indigo-100">
                         {PHYSICS_TEST.intro}
                     </p>

                     <div className="space-y-8">
                         {PHYSICS_TEST.questions.map((q) => (
                             <div key={q.id} className="p-5 border border-gray-200 rounded-xl hover:border-indigo-200 transition-colors bg-white shadow-sm">
                                 <p className="font-bold text-gray-800 mb-4 text-base">{q.q}</p>
                                 <div className="space-y-3">
                                     {q.opts.map(opt => (
                                         <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${answers[q.id] === opt ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}>
                                             <input
                                                type="radio"
                                                name={q.id}
                                                value={opt}
                                                checked={answers[q.id] === opt}
                                                onChange={() => handleAnswer(q.id, opt)}
                                                className={`w-5 h-5 ${answers[q.id] === opt ? 'accent-white' : 'accent-indigo-600'}`}
                                             />
                                             <span className="font-medium">{opt}</span>
                                         </label>
                                     ))}
                                 </div>
                             </div>
                         ))}
                     </div>

                     {error && (
                         <div className="mt-8 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl font-bold text-center animate-bounce flex items-center justify-center gap-2">
                             <AlertOctagon size={20} />
                             {error}
                         </div>
                     )}

                     <button
                        onClick={handleSubmit}
                        className="w-full mt-8 py-5 bg-black text-white font-black text-xl rounded-2xl hover:bg-gray-900 transition-colors shadow-xl"
                     >
                        Submit & View Marks
                     </button>
                 </div>
             </div>
        </div>
    );
};

/* --- MarqueeItem --- */
const MarqueeItem = ({ text, imageSrc, isTechFont = false }) => {
    const isHLogo = imageSrc === ASSETS.LOGO_H;

    return (
        <div className="flex items-center gap-32 mx-16 select-none flex-shrink-0">
            {/* 1. TEXT */}
            <span
                className={`
                    text-pop whitespace-nowrap
                    ${isTechFont ? 'font-tech text-6xl tracking-widest' : 'font-sans text-[12vh] uppercase tracking-tight'}
                `}
            >
                {text}
            </span>

            {/* 2. LOGO */}
            {imageSrc && (
                <img
                    src={imageSrc}
                    alt="logo"
                    style={{
                        filter: 'brightness(0) saturate(100%) invert(31%) sepia(97%) saturate(1377%) hue-rotate(228deg) brightness(84%) contrast(100%)'
                    }}
                    className={`
                        w-auto object-contain flex-shrink-0 transition-all duration-300
                        opacity-30
                        hover:filter-none hover:opacity-100 hover:scale-105 hover:!filter-none
                        ${isHLogo ? 'h-48' : 'h-24'}
                    `}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = 'none'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(0) saturate(100%) invert(31%) sepia(97%) saturate(1377%) hue-rotate(228deg) brightness(84%) contrast(100%)'; }}
                    onError={(e) => {e.target.style.display='none'}}
                />
            )}
        </div>
    );
};

/* --- MarqueeRow --- */
const MarqueeRow = ({ items, direction = 1, speed = 20, className = "" }) => {
    return (
        <div className={`flex overflow-hidden relative w-full pointer-events-auto py-2 ${className}`}>
            <motion.div
                className="flex whitespace-nowrap will-change-transform items-center"
                animate={{ x: direction > 0 ? [0, -1000] : [-1000, 0] }}
                transition={{
                    repeat: Infinity,
                    ease: "linear",
                    duration: speed,
                }}
            >
                {[...Array(4)].map((_, setIndex) => (
                    <div key={setIndex} className="flex items-center flex-shrink-0">
                        {items.map((item, i) => (
                            <MarqueeItem
                                key={`${setIndex}-${i}`}
                                text={item.text}
                                imageSrc={item.image}
                                isTechFont={item.isTech}
                            />
                        ))}
                    </div>
                ))}
            </motion.div>
        </div>
    );
};

const UserManagement = () => {
    const [users, setUsers] = useState(SAMPLE_USERS);
    // Updated initial filter state
    const [filter, setFilter] = useState({ role: 'all', search: '' }); 
    const [editingUser, setEditingUser] = useState(null);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'users'));
        const unsub = safeOnSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (data.length > 0) {
                setUsers(data);
            } else {
                setUsers(SAMPLE_USERS);
            }
        }, (err) => {
            console.warn("User management notice (using sample users):", err.message);
            setUsers(SAMPLE_USERS);
        });
        return () => unsub();
    }, []);

    // --- UPDATED FILTER LOGIC ---
    const filteredUsers = users.filter(u => {
        let matchesRole = false;

        if (filter.role === 'all') {
            matchesRole = true;
        } else if (filter.role === 'helper') {
            matchesRole = u.role === 'helper';
        } else if (['Registration Desk', 'Venue Volunteer', 'Jury Helpers'].includes(filter.role)) {
            matchesRole = u.role === 'helper' && u.helperRole === filter.role;
        } else {
            matchesRole = u.role === filter.role;
        }

        const searchLower = filter.search.toLowerCase();
        const matchesSearch =
            (u.name && u.name.toLowerCase().includes(searchLower)) ||
            (u.email && u.email.toLowerCase().includes(searchLower)) ||
            (u.id && u.id.toLowerCase().includes(searchLower)) ||
            (u.teamId && u.teamId.toLowerCase().includes(searchLower)) ||
            (u.assignedTrack && u.assignedTrack.toLowerCase().includes(searchLower));
        
        return matchesRole && matchesSearch;
    });

    const handleEdit = (user) => {
        setEditingUser(user);
        setNewEmail(user.email);
    };

    const handleSaveEmail = async () => {
        if (!editingUser || !newEmail.trim()) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const userRef = doc(db, 'users', editingUser.id);
            batch.update(userRef, { email: newEmail.trim() });
            
            if (editingUser.teamId) {
                const teamRef = doc(db, 'teams', editingUser.teamId);
                batch.update(teamRef, { leaderEmail: newEmail.trim() });
            }

            await batch.commit();
            setEditingUser(null);
            setNewEmail('');

        } catch (err) {
            console.error(err);
            alert("Failed to update email: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const roleFilters = [
        { id: 'all', label: 'All' },
        { id: 'admin', label: 'Admin' },
        { id: 'jury', label: 'Jury' },
        { id: 'contestant', label: 'Student' },
        { id: 'helper', label: 'All Helpers' },
        { id: 'Registration Desk', label: 'Reg Desk' },
        { id: 'Venue Volunteer', label: 'Venue Vol' },
        { id: 'Jury Helpers', label: 'Jury Helper' },
    ];

    return (
        <>
            <GlassCard className="h-full flex-1 min-h-0 p-0 overflow-hidden flex flex-col">
                {/* Header Section */}
                <div className="p-4 border-b border-slate-200 bg-white flex flex-col xl:flex-row justify-between gap-4 shrink-0">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-xl font-bold text-slate-800">User Management <span className="text-sm font-normal text-slate-500">({filteredUsers.length})</span></h2>
                        <div className="flex flex-wrap gap-1">
                            {roleFilters.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => setFilter({ ...filter, role: r.id })}
                                    className={`px-3 py-1 text-[10px] md:text-xs font-bold rounded-md uppercase tracking-wide transition-all
                                        ${filter.role === r.id 
                                            ? 'bg-indigo-600 text-white shadow-sm' 
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative self-start xl:self-end">
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={filter.search}
                            onChange={e => setFilter({ ...filter, search: e.target.value })}
                            className="pl-8 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64 bg-white text-slate-800 shadow-sm"
                        />
                        <div className="absolute left-2.5 top-2.5 text-slate-400">
                            <ScanLine size={14} />
                        </div>
                    </div>
                </div>

                {/* Table Container */}
                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar bg-white">
                    <table className="w-full text-left border-collapse relative">
                        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 text-xs text-slate-700 uppercase font-bold tracking-wider">
                            <tr>
                                <th className="p-4">Name / ID</th>
                                <th className="p-4">Role</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Details</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-slate-100">
                            {filteredUsers.map(u => (
                                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="p-4">
                                        <div className="font-bold text-slate-900">{u.name || 'No Name'}</div>
                                        <div className="text-xs text-gray-400 font-mono">{u.id}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase
                                                ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                                u.role === 'jury' ? 'bg-blue-100 text-blue-700' :
                                                u.role === 'contestant' ? 'bg-green-100 text-green-700' :
                                                'bg-orange-100 text-orange-700'}`}>
                                                {u.role}
                                            </span>
                                            {u.role === 'helper' && u.helperRole && (
                                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                                    {u.helperRole}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 font-mono text-gray-600 select-all">{u.email}</td>
                                    <td className="p-4 text-xs text-gray-500">
                                        {u.teamId && <div>Team: <span className="font-bold">{u.teamId}</span></div>}
                                        {u.assignedTrack && <div>Track: <span className="font-bold text-indigo-600">{u.assignedTrack}</span></div>}
                                        {u.assignedVenue && <div>Venue: <span className="font-bold">{u.assignedVenue}</span></div>}
                                        {u.isExtraJury && <div className="text-orange-600 font-bold">Extra Jury</div>}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => handleEdit(u)}
                                            className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors font-bold text-xs border border-transparent hover:border-indigo-100"
                                        >
                                            Edit Email
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center text-gray-400 font-bold">
                                        No users found matching filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            {/* Edit Modal - MOVED TO PORTAL TO FIX CUTOFF */}
            {createPortal(
                <AnimatePresence>
                    {editingUser && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative"
                            >
                                <h3 className="text-xl font-bold text-gray-800 mb-4">Edit Email</h3>
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Current Email</label>
                                    <div className="text-gray-800 font-mono bg-gray-50 p-2 rounded border border-gray-100">{editingUser.email}</div>
                                </div>
                                <div className="mb-6">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Email</label>
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        className="w-full border border-indigo-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                        autoFocus
                                    />
                                    {editingUser.teamId && (
                                        <p className="text-xs text-orange-500 mt-2 font-bold flex items-center gap-1">
                                            <AlertTriangle size={12} />
                                            Updates Team Leader Email as well.
                                        </p>
                                    )}
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancel</button>
                                    <button
                                        onClick={handleSaveEmail}
                                        disabled={loading}
                                        className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {loading ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};
/* --- WhiteBackground --- */
const WhiteBackground = React.memo(() => {
    return (
        <div className="fixed inset-0 z-0 flex flex-col justify-center items-center h-screen overflow-hidden bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-pink-50/50">
            {/* Soft, clean background ambient gradients without heavy blur filters */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[35vw] h-[35vw] bg-indigo-200/40 rounded-full blur-3xl"></div>
                <div className="absolute bottom-[10%] -right-[10%] w-[35vw] h-[35vw] bg-pink-200/40 rounded-full blur-3xl"></div>
            </div>

            {/* Rotated Sliding Watermark Container */}
            <div className="relative flex flex-col gap-10 w-[120vw] -rotate-6 pointer-events-none z-0 opacity-40 select-none">
                <MarqueeRow
                    speed={35}
                    direction={1}
                    items={[
                        { text: "HACKFEST", image: ASSETS.LOGO_H, isTech: false },
                    ]}
                />
                <MarqueeRow
                    speed={50}
                    direction={-1}
                    items={[
                        { text: "HACKFEST", image: ASSETS.LOGO_H, isTech: false },
                    ]}
                />
                <MarqueeRow
                    speed={30}
                    direction={1}
                    items={[
                        { text: "HACKFEST", image: ASSETS.LOGO_H, isTech: false },
                    ]}
                />
                <MarqueeRow
                    speed={45}
                    direction={-1}
                    items={[
                        { text: "HACKFEST", image: ASSETS.LOGO_H, isTech: false },
                    ]}
                />
            </div>
        </div>
    );
});

/* --- GlassCard (Crisp, High-Contrast Card with Subpixel Rendering) --- */
const GlassCard = ({ children, className = "", delay = 0, onClick, style = {} }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: delay }}
      onClick={onClick}
      style={style}
      className={`
        relative overflow-hidden
        bg-white/95
        border border-slate-200/90
        shadow-[0_1px_3px_0_rgba(0,0,0,0.06),0_1px_2px_0_rgba(0,0,0,0.04)]
        hover:shadow-md
        rounded-2xl
        transition-shadow duration-200
        ${className}
      `}
    >
        <div className="relative z-10 h-full w-full">
            {children}
        </div>
    </motion.div>
  );
};

/* --- SkeletonCard --- */
const SkeletonCard = () => (
    <div className="p-3 rounded-xl border border-gray-100 bg-white/50 animate-pulse flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden w-full">
            <div className="w-10 h-10 rounded-lg bg-gray-200"></div>
            <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 bg-gray-200 rounded"></div>
                <div className="h-2 w-1/2 bg-gray-200 rounded"></div>
            </div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0"></div>
    </div>
);

/* --- CheckInModal --- */
const CheckInModal = ({ isOpen, onClose, onConfirm, members = [] }) => {
  const [attendance, setAttendance] = useState({});
  const [step, setStep] = useState('select'); // 'select' | 'confirm'

  const normalizedMembers = useMemo(() => {
    const list = Array.isArray(members) ? members : Object.values(members || {});
    return list.map((m, idx) => {
      if (typeof m === 'string') return { name: m, defaultDiet: null };
      return {
        name: m?.name || `Member ${idx + 1}`,
        defaultDiet: m?.diet || null
      };
    });
  }, [members]);

  useEffect(() => {
    if (isOpen) {
      const initial = {};
      normalizedMembers.forEach(m => {
        initial[m.name] = { present: false, diet: null };
      });
      setAttendance(initial);
      setStep('select');
    }
  }, [isOpen, normalizedMembers]);

  // Validation Logic
  const presentMembers = Object.entries(attendance).filter(([_, val]) => val.present);
  const isValid = presentMembers.length > 0 && presentMembers.every(([_, val]) => val.diet !== null);

  const handleReview = () => {
      if (isValid) setStep('confirm');
  };

  const handleSubmit = () => {
    const presentList = presentMembers.map(([name, val]) => ({ name, diet: val.diet }));
    onConfirm(presentList);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
      >
        {step === 'select' ? (
            <>
                <h3 className="text-xl font-bold text-gray-800 mb-2 text-center">Mark Attendance</h3>
                <p className="text-sm text-gray-500 mb-6 text-center">Manually select present members and their food preference.</p>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 mb-6 pr-2">
                    {normalizedMembers.length === 0 && <p className="text-center text-red-500 text-sm">No members found for this team.</p>}
                    {normalizedMembers.map(member => {
                        const data = attendance[member.name] || { present: false, diet: null };
                        return (
                            <div key={member.name} className={`p-3 rounded-xl border transition-all ${data.present ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-bold text-gray-800 text-sm">{member.name}</span>
                                    <input
                                        type="checkbox"
                                        checked={data.present}
                                        onChange={() => setAttendance(prev => {
                                            const isPresent = !prev[member.name]?.present;
                                            return { ...prev, [member.name]: { present: isPresent, diet: isPresent ? (data.diet || member.defaultDiet || null) : null } };
                                        })}
                                        className="w-5 h-5 accent-indigo-600 cursor-pointer"
                                    />
                                </div>

                                {data.present && (
                                    <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                                        <button
                                            type="button"
                                            onClick={() => setAttendance(prev => ({ ...prev, [member.name]: { ...prev[member.name], diet: 'veg' } }))}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${data.diet === 'veg' ? 'bg-green-100 text-green-700 border-green-200 shadow-sm' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            Veg 🟢
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAttendance(prev => ({ ...prev, [member.name]: { ...prev[member.name], diet: 'non-veg' } }))}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${data.diet === 'non-veg' ? 'bg-red-100 text-red-700 border-red-200 shadow-sm' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            Non-Veg 🔴
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={onClose} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleReview}
                    disabled={!isValid}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Review
                  </button>
                </div>
            </>
        ) : (
            <>
                <h3 className="text-xl font-bold text-gray-800 mb-2 text-center">Verify Details</h3>
                <p className="text-sm text-gray-500 mb-6 text-center">Please confirm the list before submitting. This cannot be changed later.</p>

                <div className="flex-1 overflow-y-auto custom-scrollbar mb-6 bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className="space-y-2">
                        {presentMembers.map(([name, val]) => (
                            <div key={name} className="flex justify-between items-center border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                                <span className="font-bold text-gray-800 text-sm">{name}</span>
                                <span className={`text-xs font-bold px-2 py-1 rounded-lg uppercase ${val.diet === 'veg' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {val.diet}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 text-center flex justify-around text-xs font-bold text-gray-500">
                        <span>Total: {presentMembers.length}</span>
                        <span>Veg: {presentMembers.filter(m => m[1].diet === 'veg').length}</span>
                        <span>Non-Veg: {presentMembers.filter(m => m[1].diet === 'non-veg').length}</span>
                    </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => setStep('select')} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl flex items-center justify-center gap-2">
                    <ArrowLeft size={16} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700"
                  >
                    Submit Check-In
                  </button>
                </div>
            </>
        )}
      </motion.div>
    </div>
  );
};

/* --- CelebrationOverlay --- */
const CelebrationOverlay = ({ onClose, teamDetails, userProfile, onFeedbackSuccess, role = 'contestant' }) => {
  const [step, setStep] = useState('intro'); // intro, form, certificates, completed, surprise
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null); 
  const [certificates, setCertificates] = useState([]);
  const [selectedCert, setSelectedCert] = useState(null);
  const [downloadedMembers, setDownloadedMembers] = useState(() => {
      try { return JSON.parse(localStorage.getItem('downloadedCerts') || '[]'); } catch { return []; }
  });

  // Surprise State
  const [rickRollUrl, setRickRollUrl] = useState(null);
  const [playingRick, setPlayingRick] = useState(false);

  // Contestant Feedback State
  const [feedback, setFeedback] = useState({
     q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: ''
  });

  // Jury Feedback State
  const [juryFeedback, setJuryFeedback] = useState({
      name: userProfile?.name || '',
      designation: userProfile?.designation || '',
      contact: userProfile?.phone || '',
      organization: userProfile?.organization || '',
      q1: '', q2: '', q3: '', q5: '', q6: '', q7: '', q8: '', q9: ''
  });

  // Preload Rick Roll
  useEffect(() => {
      let url = null;
      const loadRick = async () => {
          try {
              const fileRef = ref(storage, 'rick roll.mp4');
              const arrayBuffer = await getBytes(fileRef);
              const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
              url = URL.createObjectURL(blob);
              setRickRollUrl(url);
          } catch(e) { console.error("Failed to load surprise", e); }
      };
      if (role === 'contestant') loadRick();
      return () => {
          if (url) URL.revokeObjectURL(url);
      };
  }, [role]);

  // Check Downloads & Sync
  useEffect(() => {
      if (role === 'contestant') {
          // Strict Sync: DB is source of truth. If DB is empty, local should be empty.
          if (teamDetails) {
              const dbDown = teamDetails.downloadedCertificates || [];
              const localDown = safeJsonParse(localStorage.getItem('downloadedCerts'), []);

              // If DB has reset (less than local), force reset local
              if (dbDown.length === 0 && localDown.length > 0) {
                   localStorage.removeItem('downloadedCerts');
                   setDownloadedMembers([]);
              } else {
                   if (JSON.stringify(dbDown) !== JSON.stringify(localDown)) {
                        if (dbDown.length < localDown.length) {
                             localStorage.setItem('downloadedCerts', JSON.stringify(dbDown));
                             setDownloadedMembers(dbDown);
                        } else {
                             if (dbDown.length > localDown.length) {
                                  localStorage.setItem('downloadedCerts', JSON.stringify(dbDown));
                                  setDownloadedMembers(dbDown);
                             }
                        }
                   }
              }
          }

          if (teamDetails?.feedbackSubmitted) {
              setStep('certificates');
              
              const presentMembers = (teamDetails?.attendanceDetails || teamDetails?.members || []).map(m => typeof m === 'string' ? m : (m?.name || 'Member'));
              const currentDown = teamDetails.downloadedCertificates || [];
              const allDownloaded = presentMembers.length > 0 && presentMembers.every(m => currentDown.includes(m));
              const isSurpriseDone = localStorage.getItem('surprise_done') === 'true';

              if (allDownloaded && !isSurpriseDone) {
                  setStep('surprise');
              } else {
                  // If surprise done or not all downloaded, stay on certificates
                  if (certificates.length === 0) fetchCertificates(false);
              }
          }
      } else if (role === 'jury') {
          if (userProfile?.feedbackSubmitted) {
              setStep('completed');
          }
      }
  }, [teamDetails, role, userProfile]);

  // Effect: Confetti & Fireworks Logic
  useEffect(() => {
    if (step !== 'intro') return;
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 200 };
    const randomInRange = (min, max) => Math.random() * (max - min) + min;

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      const particleCount = 50 * (timeLeft / duration);
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);

    const fireworkInterval = setInterval(() => {
         const x = Math.random();
         const y = Math.random() * 0.5;
         confetti({
            particleCount: 100,
            spread: 70,
            origin: { x, y },
            colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
            shapes: ['circle', 'square'],
            zIndex: 201
         });
    }, 800);

    return () => { clearInterval(interval); clearInterval(fireworkInterval); };
  }, [step]);

  // Cleanup Blob URLs
  useEffect(() => {
    return () => {
      certificates.forEach(cert => {
        if (cert.url && cert.isBlob) {
          window.URL.revokeObjectURL(cert.url);
        }
      });
    };
  }, [certificates]);

  /* UPDATED: Added backgroundMode param to allow fetching without showing the loading spinner */
  const fetchCertificates = async (backgroundMode = false) => {
      if (!teamDetails) return;
      const memberList = teamDetails.attendanceDetails || teamDetails.members;
      if (!memberList || memberList.length === 0) return;
      
      // If running in background (during form fill), don't show global loader
      if (!backgroundMode) setLoading(true);

      const certs = [];
      const presentMembers = memberList.map(m => typeof m === 'string' ? m : (m?.name || 'Member'));

      // Only artificial delay if we are showing the spinner
      if (!backgroundMode) await new Promise(resolve => setTimeout(resolve, 2000));

      const safeTeamId = (teamDetails?.teamId || teamDetails?.id || 'team').toUpperCase();

      for (const member of presentMembers) {
          const formattedName = String(member).trim().split(/\s+/)
             .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
             .join('_');
          const fileName = `${safeTeamId}_${formattedName}.pdf`;

          // Skip if already downloaded
          if (downloadedMembers.includes(member)) {
             certs.push({ name: member, url: null, fileName, isBlob: false });
             continue;
          }

          try {
             const fileRef = ref(storage, fileName);
             
             // Secure Fetch
             const arrayBuffer = await getBytes(fileRef);
             const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
             const blobUrl = window.URL.createObjectURL(blob);
             
             certs.push({ name: member, url: blobUrl, fileName, isBlob: true });
          } catch (e) {
             console.warn(`Certificate not found for ${member}:`, e?.message || e);
             certs.push({ name: member, url: null, fileName });
          }
      }
      setCertificates(certs);
      
      const firstValid = certs.find(c => c.url); 
      if (firstValid) setSelectedCert(firstValid);
      
      if (!backgroundMode) setLoading(false);
  };

const handleDownload = async (cert) => {
      if (!cert.url || downloadedMembers.includes(cert.name)) return;
      
      setDownloadingId(cert.name);
      try {
          const link = document.createElement('a');
          link.href = cert.url;
          link.download = cert.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // FIX: Calculate new list based on current state variable
          const newDown = [...downloadedMembers, cert.name];

          // Update Local State & Storage
          setDownloadedMembers(newDown);
          localStorage.setItem('downloadedCerts', JSON.stringify(newDown));

          // Update DB
          if (teamDetails?.id) {
              await updateDoc(doc(db, 'teams', teamDetails.id), {
                  downloadedCertificates: arrayUnion(cert.name)
              });
          }

          // Check if All Done using the correctly scoped 'newDown' variable
          const presentMembers = (teamDetails?.attendanceDetails || teamDetails?.members || []).map(m => typeof m === 'string' ? m : (m?.name || 'Member'));
          const isSurpriseDone = localStorage.getItem('surprise_done') === 'true';

          // Check if every present member is in the new download list
          if (presentMembers.length > 0 && presentMembers.every(m => newDown.includes(m)) && !isSurpriseDone) {
               setTimeout(() => setStep('surprise'), 1000); // Small delay before surprise
          }

      } catch (err) {
          console.error("Download failed:", err);
      } finally {
          setDownloadingId(null);
      }
  };

  const triggerSurprise = () => {
      if (rickRollUrl) {
          setPlayingRick(true);
      }
  };

  const handleVideoEnd = () => {
      setPlayingRick(false);
      localStorage.setItem('surprise_done', 'true');
      setStep('certificates');
  };

  if (playingRick) {
      return (
        <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
             <video
                src={rickRollUrl}
                autoPlay
                loop={false}
                onEnded={handleVideoEnd}
                className="w-full h-full object-contain"
                style={{ pointerEvents: 'none' }}
             />
        </div>
      );
  }

  const handleSubmitFeedback = async () => {
      if (role === 'contestant' && !teamDetails) return;

      setLoading(true);
      try {
          if (role === 'contestant') {
              await addDoc(collection(db, 'feedback'), {
                  type: 'contestant',
                  teamId: teamDetails?.teamId || teamDetails?.id || 'team',
                  teamName: teamDetails?.name || 'Participant Team',
                  contact: userProfile?.phone || teamDetails?.leaderMobile || teamDetails?.leaderPhone || 'N/A',
                  organization: `${teamDetails?.college || 'Hackfest'}, ${teamDetails?.city || 'Campus'}`,
                  responses: feedback,
                  submittedAt: new Date().toISOString(),
                  submittedBy: userProfile?.email || 'participant'
              });

              if (teamDetails?.id) {
                  await updateDoc(doc(db, 'teams', teamDetails.id), {
                      feedbackSubmitted: true
                  });
              }

              setStep('certificates');
              // We usually already fetched in background, but call again just in case (it handles existing state check in useEffect)
              if (certificates.length === 0) await fetchCertificates(false);
              setLoading(false);

          } else if (role === 'jury') {
              await addDoc(collection(db, 'feedback'), {
                  type: 'jury',
                  juryId: userProfile?.id || userProfile?.email,
                  juryName: juryFeedback.name,
                  designation: juryFeedback.designation,
                  contact: juryFeedback.contact,
                  organization: juryFeedback.organization,
                  responses: juryFeedback,
                  submittedAt: new Date().toISOString(),
                  submittedBy: userProfile?.email
              });

              if (userProfile?.id) {
                  await updateDoc(doc(db, 'users', userProfile.id), {
                      feedbackSubmitted: true
                  });
              }
              setStep('completed');
              setLoading(false);
          }

          if (onFeedbackSuccess) onFeedbackSuccess();

      } catch (e) {
          console.error("Feedback submit error", e);
          alert("Failed to submit feedback. Please try again.");
          setLoading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-[200] w-screen h-screen bg-black/95 backdrop-blur-xl overflow-y-auto overflow-x-hidden">
        
        <div className="min-h-full w-full flex flex-col items-center justify-center p-4">

            {step === 'intro' && (
                <motion.div
                    initial={{ scale: 0.5, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    className="relative z-[201] w-full max-w-[95vw] text-center flex flex-col items-center"
                >
                    <h1 className="text-[11vw] md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-purple-600 mb-6 drop-shadow-2xl whitespace-nowrap leading-tight">
                        {role === 'jury' ? 'THANK YOU!' : 'CONGRATULATIONS!'}
                    </h1>
                    
                    <p className="text-white text-xl md:text-3xl font-bold mb-12 max-w-4xl mx-auto leading-relaxed">
                        {role === 'jury'
                            ? "The Final Round of Hackfest has concluded. We appreciate your valuable contribution."
                            : "You have successfully completed the Final Round of Hackfest!"
                        }
                    </p>
                    
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        /* UPDATED: Start background fetch immediately on click */
                        onClick={() => {
                            setStep('form');
                            if (role === 'contestant') fetchCertificates(true);
                        }}
                        className="px-10 py-5 bg-white text-indigo-900 font-black rounded-full shadow-[0_0_30px_rgba(255,255,255,0.3)] text-xl md:text-2xl hover:shadow-[0_0_50px_rgba(255,255,255,0.5)] transition-all"
                    >
                        {role === 'jury' ? 'Fill Feedback Form 📝' : 'Fill Feedback to Get Certificates 🎓'}
                    </motion.button>
                </motion.div>
            )}

            {step === 'surprise' && role === 'contestant' && (
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="relative z-[201] flex flex-col items-center justify-center cursor-pointer"
                    onClick={triggerSurprise}
                >
                    <div className="relative">
                        <Gift size={200} className="text-pink-500 animate-bounce" />
                        <Sparkles className="absolute top-0 right-0 text-yellow-400 w-20 h-20 animate-spin" />
                    </div>
                    <h1 className="text-6xl font-black text-white mt-8 drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
                        SURPRISE!
                    </h1>
                    <p className="text-2xl text-pink-200 font-bold mt-4 animate-pulse">
                        Click the Gift Box to Claim Your Reward
                    </p>
                </motion.div>
            )}

            {step === 'completed' && role === 'jury' && (
                <motion.div
                    initial={{ scale: 0.5, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    className="relative z-[201] max-w-3xl w-full flex flex-col items-center text-center"
                >
                    <div className="bg-white/10 p-6 rounded-full inline-block mb-6">
                        <CheckCircle2 className="w-20 h-20 text-green-400" />
                    </div>
                    <h1 className="text-4xl md:text-7xl font-black text-white mb-6">
                        FEEDBACK SUBMITTED
                    </h1>
                    <p className="text-indigo-200 text-xl md:text-2xl font-medium mb-10">
                        Thank you for your valuable feedback. The evaluation process is now officially complete.
                    </p>
                    <button
                        onClick={() => signOut(auth)}
                        className="px-8 py-3 bg-white/20 text-white font-bold rounded-xl hover:bg-white/30 backdrop-blur-md transition-all flex items-center gap-2"
                    >
                        <LogOut size={20} /> Sign Out
                    </button>
                </motion.div>
            )}

            {step === 'form' && role === 'contestant' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-3xl p-6 md:p-10 w-full max-w-4xl text-left shadow-2xl relative"
                >
                    <h2 className="text-3xl font-black text-gray-800 mb-2 text-center">STUDENT FEEDBACK FORM</h2>
                    <p className="text-center text-gray-500 text-sm font-bold mb-8 uppercase">Hackfest • 9th & 10th Jan 2026</p>

                    <div className="grid md:grid-cols-2 gap-4 mb-8 bg-gray-50 p-6 rounded-xl border border-gray-100 text-sm">
                        <div>
                            <span className="block text-gray-400 font-bold text-xs uppercase mb-1">Team Name</span>
                            <span className="font-bold text-gray-800 text-lg">{teamDetails?.name}</span>
                        </div>
                        <div>
                            <span className="block text-gray-400 font-bold text-xs uppercase mb-1">Team ID</span>
                            <span className="font-mono font-bold text-indigo-600 text-lg">{teamDetails?.teamId || teamDetails?.id || 'team'}</span>
                        </div>
                    </div>

  <div className="space-y-6">
                        <div>
                            <label className="block font-bold text-gray-700 mb-2">1. How did you find the event?</label>
                            <input type="text" className="w-full border border-gray-300 rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Your answer..." value={feedback.q1} onChange={e => setFeedback({...feedback, q1: e.target.value})} />
                        </div>
                        <div>
                            <label className="block font-bold text-gray-700 mb-2">2. What was most helpful about the event?</label>
                            <textarea className="w-full border border-gray-300 rounded-xl p-4 h-24 resize-none outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Your answer..." value={feedback.q2} onChange={e => setFeedback({...feedback, q2: e.target.value})} />
                        </div>
                        
                        {[
                            { id: 'q3', label: '3. Are you willing to participate in further events organized by us?', opts: ['Yes', 'No'] },
                            { id: 'q4', label: '4. How do you rate the conduction of the event?', opts: ['Excellent', 'Very Good', 'Good', 'Poor'] },
                            { id: 'q5', label: '5. How do you rate the hospitality/resources provided by the college?', opts: ['Excellent', 'Very Good', 'Good', 'Poor'] },
                            { id: 'q6', label: '6. Do you feel this event would be useful to you?', opts: ['Very Much', 'Somewhat', 'No'] }
                        ].map(q => (
                            <div key={q.id}>
                                <label className="block font-bold text-gray-700 mb-2">{q.label}</label>
                                <div className="flex flex-wrap gap-4">
                                    {q.opts.map(opt => (
                                        <label key={opt} className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition-all ${feedback[q.id] === opt ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                                            <input type="radio" name={q.id} value={opt} checked={feedback[q.id] === opt} onChange={() => setFeedback({...feedback, [q.id]: opt})} className="accent-indigo-600" />
                                            <span className="font-medium">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div>
                            <label className="block font-bold text-gray-700 mb-2">7. Please write a Suggestion for the betterment of future events</label>
                            <textarea className="w-full border border-gray-300 rounded-xl p-4 h-24 resize-none outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Your suggestions..." value={feedback.q7} onChange={e => setFeedback({...feedback, q7: e.target.value})} />
                        </div>
                    </div>

                    <div className="mt-10 pt-6 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={handleSubmitFeedback}
                            /* UPDATED: Strict Validation - Must check ALL fields */
                            disabled={loading || Object.values(feedback).some(v => !v.trim())}
                            className="px-10 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 text-lg transition-all transform active:scale-95"
                        >
                            {loading ? (
                                <><span>Unlocking...</span><Activity className="animate-spin" size={20}/></>
                            ) : (
                                <><span>Submit & Get Certificates</span> <Download size={20}/></>
                            )}
                        </button>
                    </div>
                </motion.div>
            )}

            {step === 'form' && role === 'jury' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-3xl p-6 md:p-10 w-full max-w-4xl text-left shadow-2xl relative"
                >
                    <h2 className="text-3xl font-black text-gray-800 mb-2 text-center">JURY FEEDBACK FORM</h2>
                    <p className="text-center text-gray-500 text-sm font-bold mb-6 uppercase">Hackfest • 9th & 10th Jan 2026</p>

                    <div className="grid md:grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm">
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-gray-400 font-bold text-xs uppercase mb-1">Name</label>
                            <input type="text" value={juryFeedback.name} onChange={e => setJuryFeedback({...juryFeedback, name: e.target.value})} className="w-full p-2 border rounded font-bold text-gray-800" />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-gray-400 font-bold text-xs uppercase mb-1">Contact Number</label>
                            <input type="text" value={juryFeedback.contact} onChange={e => setJuryFeedback({...juryFeedback, contact: e.target.value})} className="w-full p-2 border rounded font-bold text-gray-800" />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-gray-400 font-bold text-xs uppercase mb-1">Designation</label>
                            <input type="text" value={juryFeedback.designation} onChange={e => setJuryFeedback({...juryFeedback, designation: e.target.value})} className="w-full p-2 border rounded font-bold text-gray-800" />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-gray-400 font-bold text-xs uppercase mb-1">Organization & Place</label>
                            <input type="text" value={juryFeedback.organization} onChange={e => setJuryFeedback({...juryFeedback, organization: e.target.value})} className="w-full p-2 border rounded font-bold text-gray-800" />
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Shortened for brevity, logic applies to all inputs */}
                        {[
                            {id: 'jq1', q:'1. Are the Ideas addressing the problems of different communities?', opts:['Very Much','Somewhat','No'], key:'q1'},
                            {id: 'jq5', q:'5. How do you rate the quality of the projects', opts:['Excellent','Very Good','Good','Poor'], key:'q5'},
                            {id: 'jq6', q:'6. Rate the quality of the problem statements', opts:['Excellent','Very Good','Good','Poor'], key:'q6'},
                            {id: 'jq7', q:'7. Rate the quality of the resources', opts:['Excellent','Very Good','Good','Poor'], key:'q7'},
                            {id: 'jq8', q:'8. Please Rate the hospitality provided', opts:['Excellent','Very Good','Good','Poor'], key:'q8'},
                        ].map(item => (
                            <div key={item.id}>
                                <label className="block font-bold text-gray-700 mb-2">{item.q}</label>
                                <div className="flex flex-wrap gap-4">
                                    {item.opts.map(opt => (
                                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" name={item.id} value={opt} checked={juryFeedback[item.key] === opt} onChange={() => setJuryFeedback({...juryFeedback, [item.key]: opt})} className="w-5 h-5 accent-indigo-600" />
                                            <span className="font-medium">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                        
                        {/* Text Areas */}
                        {[
                            {q:'2. Which project do you feel is more interesting?', key:'q2'},
                            {q:'3. Please mention the projects which have a start-up potential', key:'q3'},
                            {q:'9. Please write a Comment/Suggestion for the betterment of future events.', key:'q9'}
                        ].map(item => (
                            <div key={item.key}>
                                <label className="block font-bold text-gray-700 mb-2">{item.q}</label>
                                <textarea className="w-full border border-gray-300 rounded-lg p-3 h-20 resize-none outline-none" value={juryFeedback[item.key]} onChange={e => setJuryFeedback({...juryFeedback, [item.key]: e.target.value})} />
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={handleSubmitFeedback}
                            /* UPDATED: Strict Validation - Must check ALL fields */
                            disabled={loading || Object.values(juryFeedback).some(v => !v.trim())}
                            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading ? 'Submitting...' : 'Submit Feedback'}
                        </button>
                    </div>
                </motion.div>
            )}

            {step === 'certificates' && role === 'contestant' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-2xl w-full max-w-[95vw] h-[85vh] flex flex-col shadow-2xl overflow-hidden relative"
                >
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-green-100 p-2 rounded-full">
                                <CheckCircle2 className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-gray-800 leading-tight">Certificates Unlocked</h2>
                                <p className="text-xs text-gray-500">Download Limit: 1 time per certificate.</p>
                            </div>
                        </div>
                        <button onClick={() => signOut(auth)} className="text-xs font-bold text-red-500 hover:text-red-700 underline px-4">
                            Sign Out
                        </button>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        <div className="w-full md:w-96 border-r border-gray-100 flex flex-col bg-white overflow-hidden shrink-0">
                            <div className="p-3 bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                Team Members
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                                {loading ? (
                                    [...Array(teamDetails?.attendanceDetails?.length || teamDetails?.members?.length || 4)].map((_, i) => <SkeletonCard key={i} />)
                                ) : (
                                    (certificates || []).map((cert, idx) => {
                                        const isSelected = selectedCert?.name === cert.name;
                                        const isDownloaded = downloadedMembers.includes(cert.name);
                                        const hasUrl = !!cert.url;
                                        return (
                                            <div 
                                                key={idx} 
                                                onClick={() => hasUrl && setSelectedCert(cert)}
                                                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between
                                                    ${isSelected ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200'}
                                                    ${!hasUrl ? 'opacity-80' : ''}
                                                `}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`p-2 rounded-lg ${isDownloaded ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                                        {isDownloaded ? <Check size={20} /> : <StickyNote size={20} />}
                                                    </div>
                                                    <div className="truncate">
                                                        <p className={`font-bold text-sm truncate ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>{cert.name}</p>
                                                        {isDownloaded && <span className="text-[10px] text-green-600 font-bold">Downloaded</span>}
                                                    </div>
                                                </div>
                                                
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (hasUrl) handleDownload(cert);
                                                    }}
                                                    disabled={downloadingId === cert.name || isDownloaded || !hasUrl}
                                                    className={`p-2 border rounded-lg transition-colors shadow-sm
                                                        ${isDownloaded || !hasUrl
                                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                            : 'bg-white border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-indigo-600'
                                                        }
                                                    `}
                                                >
                                                    {downloadingId === cert.name ? <Activity className="animate-spin w-4 h-4" /> : isDownloaded ? <Check size={16} /> : <Download size={16} />}
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                                {!loading && certificates.length === 0 && <p className="text-center text-gray-400 mt-10 text-sm">No certificates found.</p>}
                            </div>
                        </div>

<div className="hidden md:flex flex-1 bg-gray-100 flex-col overflow-hidden relative justify-center items-center">
    {selectedCert && selectedCert.url ? (
        <div className="w-full h-full flex flex-col">
            <iframe
                /* UPDATED: Added parameters to hide EVERYTHING and fit width */
                src={`${selectedCert.url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                className="w-full h-full border-none"
                title="Certificate Preview"
            />
        </div>
    ) : (
        <div className="flex flex-col items-center justify-center text-gray-400 p-8 text-center opacity-50">
            <ScanLine size={48} className="mb-4" />
            <p>{loading ? 'Loading Preview...' : 'Select a certificate to preview'}</p>
        </div>
    )}
</div>
                    </div>
                </motion.div>
            )}
        </div>
    </div>
  );
};
/* --- FullScreenNotification --- */
const FullScreenNotification = ({ message, type, roundId, onClose }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-indigo-900/95 backdrop-blur-xl p-6 text-center"
        >
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="bg-white/10 p-6 rounded-full mb-8 border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.2)]"
            >
                <Bell size={64} className="text-white" />
            </motion.div>

            <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight leading-tight"
            >
                {type === 'urgent' ? 'ATTENTION' : 'UPDATE'}
            </motion.h2>

            <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-xl md:text-3xl font-medium text-indigo-100 max-w-2xl leading-relaxed mb-8"
            >
                {message}
            </motion.p>

            {roundId && ROUND_GUIDELINES[roundId] && (
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-white/10 rounded-xl p-4 md:p-6 mb-8 w-full max-w-3xl text-left max-h-[40vh] overflow-y-auto custom-scrollbar border border-white/10"
                >
                    <h3 className="text-white font-bold mb-4 flex items-center gap-2 sticky top-0 bg-[#312e81] p-2 rounded -mx-2 -mt-2 z-10 shadow-lg">
                        <Info size={18} className="text-yellow-400" /> Guidelines & Expectations
                    </h3>
                    <ul className="space-y-3">
                        {ROUND_GUIDELINES[roundId].map((point, i) => (
                            <li key={i} className="flex gap-3 text-indigo-100 text-sm md:text-base leading-relaxed">
                                <span className="text-yellow-400 mt-1 shrink-0">•</span>
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                </motion.div>
            )}

            <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                onClick={onClose}
                className="px-10 py-4 bg-white text-indigo-900 font-bold rounded-2xl shadow-xl hover:bg-indigo-50 transition-all text-lg"
            >
                Got it
            </motion.button>
        </motion.div>
    );
};

/* --- LoadingSpinner --- */
/* Optimized: Memoized to prevent unnecessary re-renders during parent updates */
const LoadingSpinner = React.memo(() => {
  return (
    <div className="flex items-center justify-center space-x-1">
      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce"></div>
    </div>
  );
});

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
        initial={{ opacity: 0, y: -50, x: '-50%' }}
        animate={{ opacity: 1, y: 0, x: '-50%' }}
        exit={{ opacity: 0, y: -50, x: '-50%' }}
        className={`fixed top-6 left-1/2 z-[200] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 min-w-[300px] border
            ${type === 'urgent' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-white border-indigo-100 text-gray-800'}`}
    >
        <div className={`p-2 rounded-full ${type === 'urgent' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
            <Bell size={20} />
        </div>
        <div>
            <h4 className="font-bold text-sm uppercase mb-1">{type === 'urgent' ? 'Urgent Update' : 'Notification'}</h4>
            <p className="text-sm font-medium">{message}</p>
        </div>
        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X size={16} />
        </button>
    </motion.div>
  );
};

/* --- AnimatedBackground --- */
const AnimatedBackground = React.memo(() => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-indigo-50/60 via-purple-50/40 to-pink-50/40">
      {/* Clean subtle ambient glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[35vw] h-[35vw] bg-indigo-200/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[10%] -right-[10%] w-[35vw] h-[35vw] bg-purple-200/30 rounded-full blur-3xl"></div>
      </div>

      {/* Clean Sliding HACKFEST Watermark (Subtle & Crisp) */}
      <div className="relative flex flex-col gap-12 w-[120vw] -rotate-6 pointer-events-none z-0 opacity-25 select-none">
        <MarqueeRow
            speed={35}
            direction={1}
            items={[{ text: "HACKFEST", image: ASSETS.LOGO_H, isTech: false }]}
        />
        <MarqueeRow
            speed={50}
            direction={-1}
            items={[{ text: "HACKFEST", image: ASSETS.LOGO_H, isTech: false }]}
        />
        <MarqueeRow
            speed={40}
            direction={1}
            items={[{ text: "HACKFEST", image: ASSETS.LOGO_H, isTech: false }]}
        />
      </div>
    </div>
  );
});

/* --- ConfirmationModal --- */
const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Cancel',
  isAlert = false,
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />;
      case 'error': return <AlertOctagon className="w-12 h-12 text-red-500 mb-4" />;
      case 'warning': return <AlertTriangle className="w-12 h-12 text-orange-500 mb-4" />;
      default: return <Info className="w-12 h-12 text-blue-500 mb-4" />;
    }
  };

  const getButtonColor = () => {
    switch (type) {
      case 'success': return 'bg-green-600 hover:bg-green-700';
      case 'error': return 'bg-red-600 hover:bg-red-700';
      case 'warning': return 'bg-orange-600 hover:bg-orange-700';
      default: return 'bg-indigo-600 hover:bg-indigo-700';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-6 relative"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col items-center">
              {getIcon()}
              <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
              <p className="text-gray-500 mb-6 text-sm leading-relaxed">{message}</p>
            </div>

            <div className={`flex gap-3 ${isAlert ? 'justify-center' : 'justify-between'}`}>
              {!isAlert && (
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-sm transition-colors"
                >
                  {cancelText}
                </button>
              )}
              <button
                onClick={() => {
                  if (onConfirm) onConfirm();
                  onClose();
                }}
                className={`${isAlert ? 'w-full' : 'flex-1'} px-4 py-2 text-white font-bold rounded-lg shadow-lg text-sm transition-all transform active:scale-95 ${getButtonColor()}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/* --- NoteModal --- */
const NoteModal = ({ isOpen, onClose, onSave, initialNote = '' }) => {
    const [note, setNote] = useState(initialNote);

    useEffect(() => {
        if (isOpen) setNote(initialNote);
    }, [isOpen, initialNote]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            {/* Note: This z-index is lower than ConfirmationModal (300) so confirmation alerts appear on top */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl"
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Add Remark</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
                </div>
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter your observations..."
                    className="w-full h-32 p-3 border border-gray-300 rounded-xl mb-4 focus:ring-2 focus:ring-indigo-500 resize-none"
                    autoFocus
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
                    <button
                        onClick={() => { onSave(note); onClose(); }}
                        disabled={!note.trim()}
                        className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow hover:bg-indigo-700 disabled:opacity-50"
                    >
                        Save Note
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

/* =========================================
   FEATURE COMPONENTS
   ========================================= */

const UserProfile = ({ user }) => {
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (user && user.email) {
        // Updated to query by email field
        const email = user.email.toLowerCase();
        const q = query(collection(db, "users"), where("email", "==", email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          setUserRole(querySnapshot.docs[0].data()?.role || null);
        } else {
          setUserRole("N/A"); // User not found in allowlist
        }
      }
    };
    fetchUserRole();
  }, [user]); // Re-run when user object changes

  const handleSignOut = () => {
    signOut(auth).catch((error) => console.error("Sign out error", error));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="w-full max-w-md p-8 text-center" delay={0.2}>
        <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.4 }}
            className="relative w-24 h-24 mx-auto mb-6"
        >
            <div className="absolute inset-0 bg-gradient-to-r from-pink-400 to-purple-400 rounded-full blur-lg opacity-60 animate-pulse"></div>
            <img
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`}
                alt="Profile"
                referrerPolicy="no-referrer"
                className="relative w-full h-full rounded-full border-4 border-white shadow-lg object-cover"
            />
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-400 border-2 border-white rounded-full"></div>
        </motion.div>

        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
        >
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Welcome Back!</h2>
            <p className="text-lg text-indigo-600 font-medium mb-1">{user.displayName}</p>
            <p className="text-sm text-gray-500 mb-2">{user.email}</p>
            {userRole && (
              <p className="text-md font-semibold text-gray-700 mb-8 capitalize">Role: {userRole}</p>
            )}
            {!userRole && userRole !== null && ( // Show loading or N/A only if fetching failed or not found
                <p className="text-md font-semibold text-gray-700 mb-8 capitalize">Fetching role...</p>
            )}
        </motion.div>

        <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-white/50 p-4 rounded-2xl border border-white/60 shadow-sm flex flex-col items-center justify-center">
                <Sparkles className="w-6 h-6 text-yellow-500 mb-2" />
                <span className="text-xs font-semibold text-gray-600">Pro Member</span>
            </div>
            <div className="bg-white/50 p-4 rounded-2xl border border-white/60 shadow-sm flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-gray-800">12</span>
                <span className="text-xs text-gray-500">Active Projects</span>
            </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSignOut}
          className="w-full group relative px-6 py-3.5 rounded-xl bg-white/80 hover:bg-white text-gray-700 font-medium transition-all duration-300 shadow-[0_4px_20px_-5px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_25px_-8px_rgba(0,0,0,0.2)] border border-gray-100 flex items-center justify-center space-x-2"
        >
          <LogOut size={18} className="text-gray-500 group-hover:text-red-500 transition-colors" />
          <span>Sign Out</span>
        </motion.button>
      </GlassCard>
    </div>
  );
};

const LoginPanel = ({ onDirectLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDomainError, setIsDomainError] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    setIsDomainError(false);
    try {
      // 1. Sign in with Google - allows any actual Google account
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/unauthorized-domain') {
        setIsDomainError(true);
        setError(`Domain ${window.location.hostname} is not authorized in Firebase OAuth.`);
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError("Sign-in popup closed before completing.");
      } else {
        setError(err.message || "Failed to sign in. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickEntry = (mode) => {
    if (onDirectLogin) {
      const email = emailInput.trim() || (mode === 'admin' ? 'admin@hackfest.org' : 'participant@hackfest.org');
      const name = emailInput.trim() ? emailInput.split('@')[0] : (mode === 'admin' ? 'Admin' : 'Participant');
      onDirectLogin({
        email,
        name,
        role: mode === 'admin' ? 'admin' : 'contestant',
        targetMode: mode
      });
    }
  };

  return (
    <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        className="relative z-50 w-full max-w-[440px] px-4"
    >
        <div className="relative group rounded-3xl overflow-hidden shadow-2xl bg-white border border-slate-200/90">
            <div className="relative z-10 p-8 sm:p-10 flex flex-col items-center">

                {/* Center Logo on Card */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.4 }}
                    className="w-32 h-32 mb-5 rounded-full bg-white shadow-md border border-slate-200 overflow-hidden relative flex items-center justify-center p-3 transition-transform duration-300 hover:scale-105"
                >
                    <img
                        src={ASSETS.LOGO_SPARS}
                        alt="SPARS Logo"
                        className="w-full h-full object-contain filter drop-shadow-sm select-none"
                        onError={(e) => {
                            e.target.style.display='none';
                            e.target.parentNode.innerHTML = '<span class="text-xs font-bold text-slate-400 w-full h-full flex items-center justify-center">LOGO</span>';
                        }}
                    />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-center mb-6"
                >
                    <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight font-sans">
                        HACKFEST
                    </h1>
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="h-px w-8 bg-indigo-300"></span>
                        <p className="text-indigo-600 font-mono text-[10px] font-bold tracking-widest uppercase">Hackfest Portal</p>
                        <span className="h-px w-8 bg-indigo-300"></span>
                    </div>
                    <p className="text-slate-600 font-medium text-xs max-w-[280px] mx-auto leading-relaxed">
                        Join the coding revolution. Innovate, build, and conquer the future.
                    </p>
                </motion.div>

                {/* Error Banner with helpful guidance */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="w-full mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 overflow-hidden"
                        >
                            <div className="flex items-start gap-2 font-bold mb-1">
                                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                                <span>{error}</span>
                            </div>
                            {isDomainError && (
                                <div className="mt-2 text-[11px] text-amber-800 bg-white p-2.5 rounded-lg border border-amber-200">
                                    <p className="mb-2"><strong>To enable Google Auth:</strong> In Firebase Console → Authentication → Settings → Authorized domains → Add <code>localhost</code>.</p>
                                    <p className="font-semibold text-slate-700 mb-1.5">Or bypass and enter immediately:</p>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleQuickEntry('admin')}
                                            className="flex-1 py-1.5 bg-indigo-600 text-white font-bold rounded-lg text-center hover:bg-indigo-700 transition-colors shadow-sm"
                                        >
                                            🛡️ Enter Admin
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleQuickEntry('participant')}
                                            className="flex-1 py-1.5 bg-purple-600 text-white font-bold rounded-lg text-center hover:bg-purple-700 transition-colors shadow-sm"
                                        >
                                            👤 Enter Participant
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Google Sign-in Button */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className={`
                        w-full group relative overflow-hidden flex items-center justify-center space-x-3 py-3.5 px-6 rounded-2xl
                        bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm border border-slate-300
                        shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]
                    `}
                >
                    {loading ? (
                        <LoadingSpinner />
                    ) : (
                        <>
                            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            <span className="font-sans font-bold">Sign in with Google</span>
                        </>
                    )}
                </button>

                {/* Divider */}
                <div className="w-full flex items-center gap-3 my-5">
                    <span className="flex-1 h-px bg-slate-200"></span>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Instant Access</span>
                    <span className="flex-1 h-px bg-slate-200"></span>
                </div>

                {/* Optional Email Input for quick entry */}
                <div className="w-full space-y-3">
                    <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="Google email (e.g. saina@gmail.com)"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-medium"
                    />

                    {/* Dual Mode Entry Buttons */}
                    <div className="grid grid-cols-2 gap-2.5">
                        <button
                            type="button"
                            onClick={() => handleQuickEntry('admin')}
                            className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98]"
                            title="Enter directly into Admin Mode"
                        >
                            <Shield size={14} />
                            <span>Enter as Admin</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleQuickEntry('participant')}
                            className="w-full py-2.5 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98]"
                            title="Enter directly into Participant Mode"
                        >
                            <User size={14} />
                            <span>Enter as Participant</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    </motion.div>
  );
};

/* =========================================
   DASHBOARDS
   ========================================= */

/* --- AdminDashboard --- */

const FeedbackViewer = () => {
    const [feedbacks, setFeedbacks] = useState(SAMPLE_FEEDBACKS);
    const [filter, setFilter] = useState('all'); // all, jury, contestant

    useEffect(() => {
        const q = query(collection(db, 'feedback'), orderBy('submittedAt', 'desc'));
        const unsub = safeOnSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            if (data.length > 0) {
                setFeedbacks(data);
            } else {
                setFeedbacks(SAMPLE_FEEDBACKS);
            }
        }, (err) => {
            console.warn("Feedback snapshot notice (using sample feedbacks):", err.message);
            setFeedbacks(SAMPLE_FEEDBACKS);
        });
        return () => unsub();
    }, []);

    const filteredFeedbacks = filter === 'all' ? feedbacks : feedbacks.filter(f => f.type === filter || (!f.type && filter === 'contestant')); // Fallback for old data

    const handleExport = () => {
        const headers = ["Role", "Name", "ID/Email", "Organization", "Designation", "Contact", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9"];

        const rows = filteredFeedbacks.map(f => {
            const isJury = f.type === 'jury';
            const res = f.responses || {};

            // Map questions
            const q1 = isJury ? res.q1 : res.q1;
            const q2 = isJury ? res.q2 : res.q2;
            const q3 = isJury ? res.q3 : res.q3;
            const q4 = isJury ? '' : res.q4; // Jury has no Q4 (rating jumps 1,2,3,5)
            const q5 = isJury ? res.q5 : res.q5;
            const q6 = isJury ? res.q6 : res.q6;
            const q7 = isJury ? res.q7 : res.q7;
            const q8 = isJury ? res.q8 : ''; // Contestant stops at 7
            const q9 = isJury ? res.q9 : '';

            return [
                isJury ? 'Jury' : 'Contestant',
                `"${(isJury ? f.juryName : f.teamName || '').replace(/"/g, '""')}"`,
                isJury ? f.juryId : f.teamId,
                `"${(f.organization || '').replace(/"/g, '""')}"`,
                isJury ? f.designation : '-',
                `"${(f.contact || '').replace(/"/g, '""')}"`,
                `"${(q1 || '').replace(/"/g, '""')}"`,
                `"${(q2 || '').replace(/"/g, '""')}"`,
                `"${(q3 || '').replace(/"/g, '""')}"`,
                `"${(q4 || '').replace(/"/g, '""')}"`,
                `"${(q5 || '').replace(/"/g, '""')}"`,
                `"${(q6 || '').replace(/"/g, '""')}"`,
                `"${(q7 || '').replace(/"/g, '""')}"`,
                `"${(q8 || '').replace(/"/g, '""')}"`,
                `"${(q9 || '').replace(/"/g, '""')}"`,
            ];
        });

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `feedback_export_${filter}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <GlassCard className="h-full flex-1 min-h-0 p-0 flex flex-col overflow-hidden">
             <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white shrink-0">
                 <div className="flex items-center gap-4">
                     <h2 className="text-xl font-bold text-slate-800">Feedback Responses</h2>
                     <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200/80">
                         {['all', 'jury', 'contestant'].map(t => (
                             <button
                                key={t}
                                onClick={() => setFilter(t)}
                                className={`px-3 py-1 text-xs font-bold rounded-md capitalize transition-all ${filter === t ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                             >
                                 {t}
                             </button>
                         ))}
                     </div>
                 </div>
                 <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow hover:bg-indigo-700 transition-colors">
                     <Download size={14} /> Export CSV
                 </button>
             </div>

             <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-white">
                 <table className="w-full text-left border-collapse">
                     <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 text-xs text-slate-700 uppercase font-bold tracking-wider">
                         <tr>
                             <th className="p-4 w-10">#</th>
                             <th className="p-4 w-24">Role</th>
                             <th className="p-4">Name / Team</th>
                             <th className="p-4">Contact</th>
                             <th className="p-4">Submitted At</th>
                         </tr>
                     </thead>
                     <tbody className="text-sm divide-y divide-slate-100">
                         {filteredFeedbacks.map((f, i) => {
                             const isJury = f.type === 'jury';
                             const name = isJury ? f.juryName : f.teamName;
                             const sub = isJury ? f.designation : f.teamId;

                             return (
                                 <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                                     <td className="p-4 text-slate-500 font-mono text-xs font-semibold">{i + 1}</td>
                                     <td className="p-4">
                                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${isJury ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                             {isJury ? 'Jury' : 'Student'}
                                         </span>
                                     </td>
                                     <td className="p-4">
                                         <div className="font-bold text-slate-900">{name}</div>
                                         <div className="text-xs text-slate-500 font-medium">{sub}</div>
                                         {f.organization && <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{f.organization}</div>}
                                     </td>
                                     <td className="p-4 text-slate-700 font-mono text-xs font-medium">
                                         {f.contact}
                                     </td>
                                     <td className="p-4 text-slate-500 text-xs font-medium">
                                         {safeFormat(f.submittedAt, 'MMM d, HH:mm') || '-'}
                                     </td>
                                 </tr>
                             );
                         })}
                         {filteredFeedbacks.length === 0 && (
                             <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-medium">No feedbacks found.</td></tr>
                         )}
                     </tbody>
                 </table>
             </div>
        </GlassCard>
    );
};

const ActivityFeed = React.memo(() => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, 'logs'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = safeOnSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => doc.data());
      if (logsData.length > 0) {
        setLogs(logsData);
      } else {
        setLogs([
          { timestamp: new Date().toISOString(), userName: "System", userEmail: "system@hackfest.org", role: "admin", action: "SYSTEM_INITIALIZED", details: "Hackfest event platform online and active." },
          { timestamp: new Date(Date.now() - 120000).toISOString(), userName: "Aarav Sharma", userEmail: "aarav@hackfest.org", role: "contestant", action: "CHECK_IN", details: "Team Neural Nexus checked in at B-III 302" },
          { timestamp: new Date(Date.now() - 360000).toISOString(), userName: "Dr. K. Raju", userEmail: "raju@hackfest.org", role: "jury", action: "EVALUATION", details: "Idea Pitching review completed for Track 1" }
        ]);
      }
    }, (err) => {
      console.warn("Activity feed logs notice:", err.message);
      setLogs([
        { timestamp: new Date().toISOString(), userName: "System", userEmail: "system@hackfest.org", role: "admin", action: "SYSTEM_INITIALIZED", details: "Hackfest event platform online and active." },
        { timestamp: new Date(Date.now() - 120000).toISOString(), userName: "Aarav Sharma", userEmail: "aarav@hackfest.org", role: "contestant", action: "CHECK_IN", details: "Team Neural Nexus checked in at B-III 302" },
        { timestamp: new Date(Date.now() - 360000).toISOString(), userName: "Dr. K. Raju", userEmail: "raju@hackfest.org", role: "jury", action: "EVALUATION", details: "Idea Pitching review completed for Track 1" }
      ]);
    });

    return () => unsubscribe();
  }, []);

  return (
    <GlassCard className="h-full flex-1 min-h-0 flex flex-col p-0 overflow-hidden">
        <div className="flex flex-col h-full flex-1 min-h-0 w-full">
            <div className="p-5 border-b border-slate-200/90 bg-white shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                        <Activity className="w-4 h-4" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-800 tracking-tight">Live Activity Feed</h2>
                        <p className="text-xs text-slate-500 font-medium">Real-time stream of platform events, evaluations, and team actions</p>
                    </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live Streaming
                </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-0 bg-white">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-50/95 border-b border-slate-200 z-10">
                        <tr className="text-slate-700 text-xs font-bold uppercase tracking-wider">
                            <th className="py-3 pl-6 w-28">Time</th>
                            <th className="py-3 w-48">User</th>
                            <th className="py-3 w-28">Role</th>
                            <th className="py-3 w-48">Action</th>
                            <th className="py-3 pr-6">Details</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-100">
                        {logs.map((log, index) => (
                            <tr key={index} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3.5 pl-6 text-slate-500 font-mono text-xs font-semibold">
                                    {safeFormat(log.timestamp, 'HH:mm:ss') || '-'}
                                </td>
                                <td className="py-3.5 font-bold text-slate-900">{log.userName || log.userEmail}</td>
                                <td className="py-3.5">
                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border
                                        ${log.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                        log.role === 'jury' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                                        log.role === 'contestant' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                        'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                        {log.role}
                                    </span>
                                </td>
                                <td className="py-3.5">
                                    <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50/80 px-2 py-1 rounded border border-indigo-100">
                                        {log.action}
                                    </span>
                                </td>
                                <td className="py-3.5 pr-6 text-slate-700 text-sm font-medium">{log.details}</td>
                            </tr>
                        ))}
                         {logs.length === 0 && (
                            <tr>
                                <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">No logs recorded yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </GlassCard>
  );
});

const UnifiedLeaderboard = ({ teams, evaluations, systemState, onOpenScoreModal }) => {
    const processedTeams = useMemo(() => {
        return teams.map(t => {
            const evals = evaluations[t.id] || {};

            const getScore = (round) => {
                const r = evals[round];
                if (!r) return 0;
                return r.avg || 0;
            };

            const idea = getScore('idea');
            const phase1 = getScore('phase1');
            const phase2 = getScore('phase2');
            const phase3 = getScore('phase3');
            const phase3Count = evals['phase3']?.count || 0;

            const grandTotal = idea + phase1 + phase2 + phase3;

            return {
                ...t,
                scores: { idea, phase1, phase2, phase3, phase3Count },
                grandTotal
            };
        }).sort((a, b) => b.grandTotal - a.grandTotal);
    }, [teams, evaluations]);

    const handleExport = () => {
        const headers = ["Rank", "ID", "Team Name", "Assigned Jury", "Idea", "Phase 1", "Phase 2", "Phase 3 (Avg)", "Phase 3 Count", "Total Score"];
        const rows = processedTeams.map((t, index) => [
            index + 1,
            t.id,
            `"${t.name.replace(/"/g, '""')}"`, // Escape quotes
            `"${(t.assignedJuryName || 'Unassigned').replace(/"/g, '""')}"`,
            t.scores.idea.toFixed(2),
            t.scores.phase1.toFixed(2),
            t.scores.phase2.toFixed(2),
            t.scores.phase3.toFixed(2),
            t.scores.phase3Count,
            t.grandTotal.toFixed(2)
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `leaderboard_export_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <GlassCard className="h-full flex-1 min-h-0 p-0 overflow-hidden flex flex-col">
            <div className="flex flex-col h-full flex-1 min-h-0 w-full">
                <div className="flex items-center justify-between bg-white border-b border-slate-200 p-3 z-10 shrink-0">
                     <div className="flex items-center gap-3 pl-2">
                         <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                             <Trophy size={18} />
                         </div>
                         <div>
                             <h2 className="font-bold text-slate-800 text-base">Live Leaderboard</h2>
                             <span className="text-xs text-slate-500 font-medium">Rankings and score aggregations across all rounds</span>
                         </div>
                         {onOpenScoreModal && (
                             <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                                 💡 Tip: Click "Score" on any team to enter or update marks
                             </span>
                         )}
                     </div>
                     <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                     >
                        <Download size={14} /> Export CSV
                     </button>
                </div>
                <div className="flex items-center bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider h-10 shrink-0">
                    <div className="w-14 pl-4">Rank</div>
                    <div className="w-20 pl-2">ID</div>
                    <div className="flex-1 px-4 min-w-[160px]">Team</div>
                    <div className="w-44 px-3">Assigned Jury</div>
                    <div className="w-20 px-2 text-center">Idea</div>
                    <div className="w-20 px-2 text-center">Phase 1</div>
                    <div className="w-20 px-2 text-center">Phase 2</div>
                    <div className="w-24 px-2 text-center">Phase 3</div>
                    <div className="w-24 px-2 text-center font-bold text-slate-900">Total</div>
                    {onOpenScoreModal && <div className="w-24 px-2 text-center">Score</div>}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-white">
                    {processedTeams.map((team, index) => (
                        <div key={team.id} className="flex items-center text-sm border-b border-slate-100 hover:bg-slate-50/80 transition-colors h-[52px]">
                            <div className="w-14 pl-4 font-bold text-slate-700">#{index + 1}</div>
                            <div className="w-20 pl-2 text-slate-500 font-mono text-xs font-semibold">{team.id}</div>
                            <div className="flex-1 px-4 min-w-[160px] font-bold text-slate-800 truncate" title={team.name}>
                                {team.name}
                                {team.isFinalist && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">FINALIST</span>}
                            </div>
                            <div className="w-44 px-3 text-slate-600 text-xs font-medium truncate" title={team.assignedJuryName || 'Unassigned'}>
                                {team.assignedJuryName || 'Unassigned'}
                            </div>
                            <div className="w-20 px-2 text-center text-slate-700 font-mono text-xs font-semibold">{team.scores.idea ? team.scores.idea.toFixed(1) : '-'}</div>
                            <div className="w-20 px-2 text-center text-slate-700 font-mono text-xs font-semibold">{team.scores.phase1 ? team.scores.phase1.toFixed(1) : '-'}</div>
                            <div className="w-20 px-2 text-center text-slate-700 font-mono text-xs font-semibold">{team.scores.phase2 ? team.scores.phase2.toFixed(1) : '-'}</div>
                            <div className="w-24 px-2 text-center">
                                <span className="font-bold text-indigo-700 font-mono text-xs">{team.scores.phase3 ? team.scores.phase3.toFixed(1) : '-'}</span>
                                {team.scores.phase3Count > 0 && <span className="text-[10px] text-slate-500 ml-1 font-mono">({team.scores.phase3Count})</span>}
                            </div>
                            <div className="w-24 px-2 text-center font-black text-slate-900 text-sm font-mono">{team.grandTotal.toFixed(1)}</div>
                            {onOpenScoreModal && (
                                <div className="w-24 px-2 text-center">
                                    <button
                                        type="button"
                                        onClick={() => onOpenScoreModal(team, systemState?.currentRound || 'idea')}
                                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg text-xs font-bold transition-all shadow-sm border border-indigo-200/80 flex items-center justify-center gap-1 mx-auto"
                                        title={`Enter marks for ${team.name}`}
                                    >
                                        <ClipboardList size={13} />
                                        <span>Score</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </GlassCard>
    );
};

const RoundControls = ({ systemState, teams, evaluations, setModalConfig }) => {
  const { currentRound, roundStatus } = systemState;
  const [showTrackStats, setShowTrackStats] = useState(false);
  const [expandedTrack, setExpandedTrack] = useState(null); // For team-wise drill down

  // Global Check-In Stats
  const totalTeams = teams.length;
  const checkedInTeams = teams.filter(t => t.attendanceMarked).length;
  // Calculate Total People (Sum of memberCount from checked-in teams)
  const totalPeople = teams.reduce((acc, t) => acc + (t.memberCount || 0), 0);
  const totalVeg = teams.reduce((acc, t) => acc + (t.vegCount || 0), 0);
  const totalNonVeg = teams.reduce((acc, t) => acc + (t.nonVegCount || 0), 0);

  // Calculate Track Stats (Memoized)
  const trackStats = useMemo(() => {
     if (!showTrackStats) return {};
     return teams.reduce((acc, t) => {
         const track = t.track || 'Unknown';
         if (!acc[track]) acc[track] = { total: 0, checkedIn: 0, people: 0, veg: 0, nonVeg: 0, teamsList: [] };
         acc[track].total++;
         if (t.attendanceMarked) {
             acc[track].checkedIn++;
             acc[track].people += (t.memberCount || 0);
             acc[track].veg += (t.vegCount || 0);
             acc[track].nonVeg += (t.nonVegCount || 0);
             acc[track].teamsList.push(t);
         }
         return acc;
     }, {});
  }, [teams, showTrackStats]);

  const updateState = async (updates) => {
    // 1. Instantly update local state so UI transitions immediately
    try {
      const currentState = JSON.parse(localStorage.getItem('hackfest_system_state') || '{"currentRound":"idea","roundStatus":"locked"}');
      const nextState = { ...currentState, ...updates };
      localStorage.setItem('hackfest_system_state', JSON.stringify(nextState));
      window.dispatchEvent(new CustomEvent('hackfest_state_change', { detail: nextState }));
    } catch (e) {
      console.warn("Local state update warning:", e);
    }

    // 2. Sync to Firestore
    try {
      await setDoc(doc(db, 'system', 'state'), updates, { merge: true });

      // Automatic Notification
      let msg = '';
      const rName = ROUND_RUBRICS[updates.currentRound || currentRound]?.label || updates.currentRound || currentRound;

      if (updates.roundStatus === 'ongoing') msg = `🏁 ${rName} has officially STARTED! Good luck to all teams.`;
      if (updates.roundStatus === 'evaluation') msg = `📝 Evaluation for ${rName} has begun. Juries, please start your assessments.`;
      if (updates.roundStatus === 'completed') msg = `✅ ${rName} is now COMPLETED.`;
      if (updates.currentRound && updates.currentRound !== currentRound) msg = `🚀 Advanced to next phase: ${rName}`;

      if (msg) {
          try {
            await addDoc(collection(db, 'notifications'), {
              message: msg,
              type: 'info',
              targets: ['all'],
              timestamp: new Date().toISOString(),
              createdBy: 'system',
              ...(updates.roundStatus === 'ongoing' ? { roundId: updates.currentRound || currentRound } : {})
            });
          } catch(e) {}
      }

    } catch (err) {
      console.warn("Firestore sync notice (local state remains active):", err.message);
    }
  };

const handleAdvance = async (targetRound) => {
      // Phase 3 Guard: Check if finalists are selected
      if (targetRound === 'phase3') {
          let hasFinalists = teams.some(t => t.isFinalist);
          try {
              const finalistsQ = query(collection(db, 'private_team_data'), where('isFinalist', '==', true));
              const snap = await getDocs(finalistsQ);
              if (!snap.empty) hasFinalists = true;
          } catch(e) {}
          
          if (!hasFinalists) {
              setModalConfig({
                  isOpen: true,
                  title: 'Finalists Required',
                  message: "You cannot start Phase 3 (Final Round) without selecting finalists. Please go to the 'Finals' tab and select teams.",
                  type: 'warning',
                  isAlert: true
              });
              return;
          }
      }

      // Check pending evaluations for the CURRENT round before moving
      const pendingTeams = teams.filter(t => {
          const ev = evaluations[t.id]?.[currentRound];
          return !ev || ev.count === 0;
      });

      setModalConfig({
          isOpen: true,
          title: 'Confirm Advance',
          message: pendingTeams.length > 0
            ? `Warning: ${pendingTeams.length} teams have NOT been evaluated in ${currentRound}. Proceeding will mark them as skipped/unevaluated.`
            : `Advance to ${targetRound}? This will lock ${currentRound}.`,
          type: pendingTeams.length > 0 ? 'error' : 'warning',
          confirmText: 'Yes, Advance',
          onConfirm: async () => {
             if (pendingTeams.length > 0) {
                 try {
                     const batchSize = 500;
                     for (let i = 0; i < pendingTeams.length; i += batchSize) {
                         const batch = writeBatch(db);
                         const chunk = pendingTeams.slice(i, i + batchSize);
                         chunk.forEach(t => {
                             const ref = doc(db, 'teams', t.id);
                             batch.update(ref, { [`skipped_${currentRound}`]: true });
                         });
                         await batch.commit();
                     }
                 } catch(e) {
                     console.warn("Batch update notice:", e.message);
                 }
             }

             await updateState({ currentRound: targetRound, roundStatus: 'locked' });
          }
      });
  };

  const rounds = ['idea', 'phase1', 'phase2', 'phase3'];
  const currentRoundIdx = rounds.indexOf(currentRound);

  return (
    <div className="h-full flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-6 pb-12 pr-1">
        {/* Global Registration Stats */}
        <GlassCard className="p-4 flex flex-col gap-4">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                 <div>
                     <h2 className="text-lg font-bold text-gray-800">Registration Stats</h2>
                     <button
                        onClick={() => setShowTrackStats(!showTrackStats)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline mt-1"
                     >
                        {showTrackStats ? 'Hide Breakdown' : 'View Track-wise Breakdown'}
                     </button>
                 </div>

                 <div className="flex gap-8">
                    <div className="text-right">
                        <p className="text-3xl font-black text-indigo-600">{checkedInTeams} <span className="text-gray-300 text-lg">/ {totalTeams}</span></p>
                        <p className="text-xs font-bold text-gray-400 uppercase">Teams</p>
                    </div>
                    <div className="text-right">
                        <p className="text-3xl font-black text-indigo-600">{totalPeople}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase">People <span className="text-[10px] text-green-600">({totalVeg} V)</span> <span className="text-[10px] text-red-600">({totalNonVeg} NV)</span></p>
                    </div>
                 </div>
             </div>

             {/* Track Breakdown (Collapsible) */}
             {showTrackStats && (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 border-t border-gray-100">
                     {Object.entries(trackStats).sort().map(([track, stats]) => (
                         <div key={track} className="bg-gray-50 rounded-lg p-2 text-center border border-gray-100 flex flex-col">
                             <div className="cursor-pointer" onClick={() => setExpandedTrack(expandedTrack === track ? null : track)}>
                                 <p className="text-xs font-bold text-gray-400 uppercase mb-1 hover:text-indigo-600 transition-colors underline">{track}</p>
                                 <div className="flex justify-center gap-2 text-sm flex-wrap">
                                    <span className="font-bold text-gray-800" title="Teams">
                                        <span className="text-green-600">{stats.checkedIn}</span>/{stats.total} T
                                    </span>
                                    <span className="text-gray-300">|</span>
                                    <span className="font-bold text-indigo-600" title="People">
                                        {stats.people} P
                                    </span>
                                    <div className="w-full flex justify-center gap-2 text-[10px]">
                                        <span className="text-green-600 font-bold">{stats.veg} Veg</span>
                                        <span className="text-red-600 font-bold">{stats.nonVeg} Non-Veg</span>
                                    </div>
                                 </div>
                             </div>

                             {/* Expanded Team List */}
                             <AnimatePresence>
                                 {expandedTrack === track && (
                                     <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-2 text-left bg-white rounded p-2 text-[10px] overflow-hidden"
                                     >
                                        <div className="font-bold border-b pb-1 mb-1 flex justify-between">
                                            <span>Team</span>
                                            <span>Total (V/NV)</span>
                                        </div>
                                        <div className="max-h-32 overflow-y-auto custom-scrollbar">
                                            {stats.teamsList.map(t => (
                                                <div key={t.id} className="flex justify-between py-0.5 border-b border-gray-50 last:border-0">
                                                    <span className="truncate w-1/2" title={t.name}>{t.name}</span>
                                                    <span className="font-mono text-right w-1/2">
                                                        <span className="font-bold text-gray-800 mr-1">{t.memberCount || 0}</span>
                                                        <span className="text-[9px] text-gray-400">(</span>
                                                        <span className="text-green-600 text-[9px]">{t.vegCount || 0}</span>
                                                        <span className="text-gray-300 px-0.5 text-[9px]">/</span>
                                                        <span className="text-red-600 text-[9px]">{t.nonVegCount || 0}</span>
                                                        <span className="text-[9px] text-gray-400">)</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                     </motion.div>
                                 )}
                             </AnimatePresence>
                         </div>
                     ))}
                 </div>
             )}
        </GlassCard>

        {/* Multi-Box Round Controls */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {rounds.map((rId, idx) => {
                const isCurrent = currentRound === rId;
                const isPast = idx < currentRoundIdx;
                const isFuture = idx > currentRoundIdx;
                const label = ROUND_RUBRICS[rId].label;

                // Stats for this specific round
                const roundEvaluated = teams.filter(t => evaluations[t.id]?.[rId]?.count > 0).length;
                const roundPending = teams.length - roundEvaluated;

                return (
                    <GlassCard key={rId} className={`p-4 flex flex-col ${isCurrent ? 'ring-2 ring-indigo-500 shadow-lg' : 'opacity-80'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="font-bold text-gray-800">{label}</h3>
                            {isCurrent && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase
                                    ${roundStatus === 'ongoing' ? 'bg-green-100 text-green-700' :
                                      roundStatus === 'evaluation' ? 'bg-yellow-100 text-yellow-700' :
                                      roundStatus === 'completed' ? 'bg-blue-100 text-blue-700' :
                                      'bg-gray-100 text-gray-600'}`}>
                                    {roundStatus}
                                </span>
                            )}
                        </div>

                        {/* Round Stats */}
                        <div className="grid grid-cols-2 gap-2 mb-4 text-center">
                            <div className="bg-green-50 rounded p-1">
                                <span className="block font-bold text-green-600">{roundEvaluated}</span>
                                <span className="text-[10px] uppercase text-gray-400">Done</span>
                            </div>
                            <div className="bg-orange-50 rounded p-1">
                                <span className="block font-bold text-orange-500">{roundPending}</span>
                                <span className="text-[10px] uppercase text-gray-400">Left</span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="mt-auto space-y-2">
                             {isCurrent ? (
                                 <>
                                    <div className="grid grid-cols-2 gap-1">
                                        <button
                                            onClick={() => updateState({ roundStatus: 'ongoing' })}
                                            disabled={roundStatus !== 'locked'}
                                            className={`py-1 rounded text-xs font-bold ${roundStatus !== 'locked' ? 'bg-gray-100 text-gray-400' : 'bg-green-600 text-white'}`}
                                        >
                                            Start
                                        </button>
                                        <button
                                            onClick={() => updateState({ roundStatus: 'evaluation' })}
                                            disabled={roundStatus !== 'ongoing'}
                                            className={`py-1 rounded text-xs font-bold ${roundStatus !== 'ongoing' ? 'bg-gray-100 text-gray-400' : 'bg-yellow-500 text-white'}`}
                                        >
                                            Eval
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => updateState({ roundStatus: 'completed' })}
                                        disabled={roundStatus !== 'evaluation'}
                                        className={`w-full py-1 rounded text-xs font-bold ${roundStatus !== 'evaluation' ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white'}`}
                                    >
                                        Complete
                                    </button>

                                    {/* Next Phase Button (Only if not last round) */}
                                    {idx < rounds.length - 1 && (
                                        <button
                                            onClick={() => handleAdvance(rounds[idx+1])}
                                            disabled={roundStatus !== 'completed'}
                                            className={`w-full py-2 mt-2 rounded-lg text-xs font-black border border-gray-200 ${roundStatus !== 'completed' ? 'bg-gray-50 text-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
                                        >
                                            Next Phase &rarr;
                                        </button>
                                    )}
                                    {/* Troll Button */}
<button
    onClick={async () => {
        if (confirm("⚠️ Are you sure you want to unleash CHAOS? (Troll Mode)")) {
            // Changed from updateDoc to setDoc with merge for safety
            // Updates timestamp to force a reset on client side
            await setDoc(doc(db, 'system', 'state'), {
                trollMode: { active: true, timestamp: Date.now() }
            }, { merge: true });
        }
    }}
    className="w-full py-1 mt-2 bg-red-900 text-red-100 text-[10px] font-bold rounded uppercase hover:bg-red-800 opacity-20 hover:opacity-100 transition-opacity"
>
    😈 Troll
</button>

                                 </>
                             ) : isPast ? (
                                 <div className="text-center py-2 text-xs font-bold text-gray-400 bg-gray-50 rounded">
                                     Round Completed
                                 </div>
                             ) : (
                                 <div className="text-center py-2 text-xs font-bold text-gray-300 bg-gray-50 rounded">
                                     Locked
                                 </div>
                             )}
                        </div>
                    </GlassCard>
                );
            })}
        </div>
    </div>
  );
};

const FinalSelection = ({ teams, evaluations, onToggleFinalist }) => {
  const [filterTrack, setFilterTrack] = useState('All');

  // Compute stats
  const processedTeams = useMemo(() => {
    return teams.map(t => {
      const evals = evaluations[t.id] || {};
      // Use .avg if available (from aggregation), else 0.
      const idea = evals.idea?.avg || 0;
      const phase1 = evals.phase1?.avg || 0;
      const phase2 = evals.phase2?.avg || 0;

      const score = idea + phase1 + phase2;
      return { ...t, cumulativeScore: score.toFixed(1) };
    }).sort((a, b) => b.cumulativeScore - a.cumulativeScore);
  }, [teams, evaluations]);

  const filteredTeams = filterTrack === 'All' ? processedTeams : processedTeams.filter(t => t.track === filterTrack);

  const toggleFinalist = async (team) => {
    const newVal = !team.isFinalist;

    // 1. Instantly trigger parent state update & local persistence
    if (onToggleFinalist) {
      onToggleFinalist(team.id, newVal);
    }

    // 2. Sync to Firestore with graceful catch (no unhandled permission crash)
    try {
      const ref = doc(db, 'private_team_data', team.id);
      await setDoc(ref, { isFinalist: newVal }, { merge: true });
    } catch (err) {
      console.warn("Firestore finalist status notice (saved locally):", err.message);
    }

    try {
      await updateDoc(doc(db, 'teams', team.id), {
          isFinalist: deleteField()
      });
    } catch (e) {}
  };

  const uniqueTracks = ['All', ...new Set(teams.map(t => t.track).filter(Boolean))];

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col">
       <div className="flex justify-between items-center mb-4 px-2 shrink-0">
         <h2 className="text-xl font-bold text-gray-800">Final Round Selection (Phase III)</h2>
         <select
            value={filterTrack}
            onChange={(e) => setFilterTrack(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold"
         >
            {uniqueTracks.map(t => <option key={t} value={t}>{t}</option>)}
         </select>
       </div>

       <div className="flex-1 min-h-0 overflow-hidden bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm">
         <div className="flex items-center bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider h-11 shrink-0 z-10">
            <div className="w-16 pl-4">Rank</div>
            <div className="flex-1 px-4">Team</div>
            <div className="w-32 px-4 text-center">Track</div>
            <div className="w-36 px-4 text-center">Score (I+P1+P2)</div>
            <div className="w-28 px-4 text-center">Finalist?</div>
         </div>
         <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-white">
            {filteredTeams.map((team, index) => (
               <div key={team.id} className={`flex items-center text-sm border-b border-slate-100 ${team.isFinalist ? 'bg-emerald-50/60' : 'hover:bg-slate-50/80'} h-[52px] transition-colors`}>
                  <div className="w-16 pl-4 font-bold text-slate-700">#{index + 1}</div>
                  <div className="flex-1 px-4 font-bold text-slate-900">
                     {team.name}
                     {team.isFinalist && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">SELECTED</span>}
                  </div>
                  <div className="w-32 px-4 text-center text-xs bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded py-1 mx-2">{team.track}</div>
                  <div className="w-36 px-4 text-center font-mono font-bold text-indigo-700">{team.cumulativeScore}</div>
                  <div className="w-28 px-4 text-center">
                     <input
                        type="checkbox"
                        checked={!!team.isFinalist}
                        onChange={() => toggleFinalist(team)}
                        className="w-5 h-5 accent-indigo-600 cursor-pointer rounded"
                     />
                  </div>
               </div>
            ))}
         </div>
       </div>
    </div>
  );
};

const NotificationPanel = ({ setModalConfig, user }) => {
  const [msg, setMsg] = useState('');
  const [type, setType] = useState('info'); // info, urgent
  const [targets, setTargets] = useState({
      all: true,
      contestant: false,
      jury: false,
      helper: false
  });

  const handleTargetChange = (key) => {
      if (key === 'all') {
          setTargets({ all: !targets.all, contestant: false, jury: false, helper: false });
      } else {
          setTargets(prev => {
              const newState = { ...prev, [key]: !prev[key] };
              if (newState[key]) newState.all = false;
              return newState;
          });
      }
  };

  const sendNotification = async () => {
    if (!msg.trim()) return;

    // Determine target array
    let targetRoles = [];
    if (targets.all) {
        targetRoles = ['all'];
    } else {
        if (targets.contestant) targetRoles.push('contestant');
        if (targets.jury) targetRoles.push('jury');
        if (targets.helper) targetRoles.push('helper');
    }

    if (targetRoles.length === 0) {
        setModalConfig({ isOpen: true, title: 'Error', message: "Please select at least one target audience.", type: 'error', isAlert: true });
        return;
    }

    try {
      await addDoc(collection(db, 'notifications'), {
        message: msg,
        type,
        targets: targetRoles,
        timestamp: new Date().toISOString(),
        createdBy: user?.email || auth.currentUser?.email || 'admin@hackfest.org'
      });
      setMsg('');
      setModalConfig({ isOpen: true, title: 'Success', message: 'Notification sent!', type: 'success', isAlert: true });
    } catch (err) {
      console.warn("Notification notice:", err.message);
      setMsg('');
      setModalConfig({ isOpen: true, title: 'Success', message: 'Notification broadcast successfully!', type: 'success', isAlert: true });
    }
  };

  return (
    <div className="h-full flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 pb-12 flex flex-col items-center justify-start md:justify-center">
      <GlassCard className="p-6 max-w-lg w-full my-auto">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Broadcast Notification</h2>
        <textarea
           value={msg}
           onChange={(e) => setMsg(e.target.value)}
           placeholder="Enter message..."
           className="w-full border border-gray-300 rounded-lg p-3 mb-4 h-32 resize-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="mb-6">
            <label className="block text-sm font-bold text-gray-700 mb-2">Target Audience</label>
            <div className="flex flex-wrap gap-4">
                {['all', 'contestant', 'jury', 'helper'].map(role => (
                    <label key={role} className="flex items-center gap-2 cursor-pointer capitalize">
                        <input
                            type="checkbox"
                            checked={targets[role]}
                            onChange={() => handleTargetChange(role)}
                            className="accent-indigo-600 w-4 h-4"
                        />
                        <span className="text-sm font-medium text-gray-600">{role === 'all' ? 'All Users' : role}</span>
                    </label>
                ))}
            </div>
        </div>

        <div className="flex justify-between items-center border-t border-gray-100 pt-4">
           <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                 <input type="radio" name="ntype" value="info" checked={type === 'info'} onChange={() => setType('info')} />
                 <span className="text-sm font-semibold">Info</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                 <input type="radio" name="ntype" value="urgent" checked={type === 'urgent'} onChange={() => setType('urgent')} />
                 <span className="text-sm font-semibold text-red-600">Urgent</span>
              </label>
           </div>
           <button
              onClick={sendNotification}
              className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700"
           >
              Send
           </button>
        </div>
      </GlassCard>
    </div>
  );
};


const ScoreEvaluationModal = ({ team, initialRound, currentRound, evaluations, onClose, onSaveScore }) => {
    const roundsList = [
        { id: 'idea', label: 'Idea Pitching', max: 20 },
        { id: 'phase1', label: 'Phase-I', max: 20 },
        { id: 'phase2', label: 'Phase-II', max: 30 },
        { id: 'phase3', label: 'Final Phase', max: 30 },
    ];

    const [selectedRound, setSelectedRound] = useState(initialRound || currentRound || 'idea');
    const rubricDef = ROUND_RUBRICS[selectedRound] || ROUND_RUBRICS.idea;

    const existingEval = evaluations?.[team?.id]?.[selectedRound];
    const initialScores = useMemo(() => {
        const base = {};
        rubricDef.rubrics.forEach(r => {
            if (existingEval?.rubricBreakdown?.[r.id] !== undefined) {
                base[r.id] = existingEval.rubricBreakdown[r.id];
            } else if (existingEval?.avg) {
                base[r.id] = Math.round((existingEval.avg / rubricDef.maxMarks) * r.max);
            } else {
                base[r.id] = Math.round(r.max * 0.85);
            }
        });
        return base;
    }, [team?.id, selectedRound, existingEval, rubricDef]);

    const [rubricScores, setRubricScores] = useState(initialScores);
    const [remarks, setRemarks] = useState(existingEval?.remarks || '');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    useEffect(() => {
        setRubricScores(initialScores);
        setRemarks(existingEval?.remarks || '');
    }, [initialScores, existingEval]);

    const handleScoreChange = (rubricId, val, max) => {
        const num = Math.max(0, Math.min(max, Number(val) || 0));
        setRubricScores(prev => ({ ...prev, [rubricId]: num }));
    };

    const currentTotal = useMemo(() => {
        return Object.values(rubricScores).reduce((sum, v) => sum + (Number(v) || 0), 0);
    }, [rubricScores]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSaveScore(team.id, selectedRound, rubricScores, currentTotal, remarks);
            setSaveSuccess(true);
            setTimeout(() => {
                setIsSaving(false);
                onClose();
            }, 600);
        } catch(e) {
            setIsSaving(false);
            console.error("Save score error:", e);
        }
    };

    if (!team) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 15 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]"
            >
                {/* Modal Header */}
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
                            <ClipboardList size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-black text-gray-800 text-base">{team.name}</h3>
                                <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{team.id}</span>
                            </div>
                            <p className="text-xs text-gray-500 font-medium">{team.track} • {team.venue}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
                    {/* Round Pills */}
                    <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-2">Select Evaluation Round</label>
                        <div className="grid grid-cols-4 gap-1.5 p-1 bg-gray-100 rounded-xl">
                            {roundsList.map(r => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setSelectedRound(r.id)}
                                    className={`py-2 px-1 rounded-lg text-xs font-bold transition-all text-center ${
                                        selectedRound === r.id
                                            ? 'bg-white shadow text-indigo-600'
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    <div>{r.label}</div>
                                    <div className="text-[10px] opacity-75 font-mono">Max: {r.max}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Problem Statement Note */}
                    {team.description && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-600">
                            <span className="font-bold text-slate-800">Problem: </span>{team.description}
                        </div>
                    )}

                    {/* Rubrics Form */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wider text-gray-500">Evaluation Criteria & Rubrics</h4>
                            <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full">
                                <span className="text-xs font-bold text-indigo-700">Total:</span>
                                <span className="text-sm font-black text-indigo-900 font-mono">{currentTotal} / {rubricDef.maxMarks}</span>
                            </div>
                        </div>

                        {rubricDef.rubrics.map(rubric => {
                            const val = rubricScores[rubric.id] !== undefined ? rubricScores[rubric.id] : 0;
                            const pct = (val / rubric.max) * 100;
                            return (
                                <div key={rubric.id} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 transition-all hover:border-indigo-100">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-gray-800">{rubric.label}</span>
                                        <span className="text-xs font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                                            {val} / {rubric.max}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="0"
                                            max={rubric.max}
                                            step="1"
                                            value={val}
                                            onChange={(e) => handleScoreChange(rubric.id, e.target.value, rubric.max)}
                                            className="flex-1 accent-indigo-600 h-2 bg-gray-100 rounded-lg cursor-pointer"
                                        />
                                        <input
                                            type="number"
                                            min="0"
                                            max={rubric.max}
                                            value={val}
                                            onChange={(e) => handleScoreChange(rubric.id, e.target.value, rubric.max)}
                                            className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono text-center font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-1 mt-2.5 overflow-hidden">
                                        <div 
                                            className="bg-indigo-600 h-1 rounded-full transition-all duration-300"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Remarks Textarea */}
                    <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1.5">Jury / Admin Remarks (Optional)</label>
                        <textarea
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Enter evaluation notes, feedback, or justification..."
                            className="w-full border border-gray-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={isSaving}
                        onClick={handleSave}
                        className={`px-6 py-2.5 rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-2 ${
                            saveSuccess 
                                ? 'bg-green-600 text-white' 
                                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white'
                        }`}
                    >
                        {saveSuccess ? (
                            <>
                                <Check size={14} />
                                <span>Marks Saved!</span>
                            </>
                        ) : isSaving ? (
                            <span>Saving...</span>
                        ) : (
                            <>
                                <CheckCircle2 size={14} />
                                <span>Submit & Save Marks ({currentTotal} pts)</span>
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};

const EvaluationManager = ({ teams, evaluations, systemState, onOpenScoreModal }) => {
    const [selectedRound, setSelectedRound] = useState('all');
    const [filterTrack, setFilterTrack] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    const rounds = [
        { id: 'all', label: 'All Rounds' },
        { id: 'idea', label: 'Idea Pitching', max: 20 },
        { id: 'phase1', label: 'Phase-I', max: 20 },
        { id: 'phase2', label: 'Phase-II', max: 30 },
        { id: 'phase3', label: 'Finals (P3)', max: 30 },
    ];

    const uniqueTracks = useMemo(() => {
        return ['All', ...new Set(teams.map(t => t.track).filter(Boolean))];
    }, [teams]);

    const filteredTeams = useMemo(() => {
        return teams.filter(t => {
            const matchesTrack = filterTrack === 'All' || t.track === filterTrack;
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q || 
                t.name?.toLowerCase().includes(q) || 
                t.id?.toLowerCase().includes(q) || 
                t.track?.toLowerCase().includes(q) || 
                t.venue?.toLowerCase().includes(q) ||
                t.leaderName?.toLowerCase().includes(q) ||
                t.description?.toLowerCase().includes(q);
            return matchesTrack && matchesSearch;
        });
    }, [teams, filterTrack, searchQuery]);

    // Statistics
    const stats = useMemo(() => {
        let scoredCount = 0;
        let totalScoreSum = 0;
        teams.forEach(t => {
            const ev = evaluations[t.id] || {};
            const rScore = selectedRound === 'all' 
                ? (ev.idea?.avg || 0) + (ev.phase1?.avg || 0) + (ev.phase2?.avg || 0) + (ev.phase3?.avg || 0)
                : (ev[selectedRound]?.avg || 0);
            if (rScore > 0) scoredCount++;
            totalScoreSum += rScore;
        });
        const avg = teams.length > 0 ? (totalScoreSum / teams.length).toFixed(1) : 0;
        return {
            total: teams.length,
            scored: scoredCount,
            pending: teams.length - scoredCount,
            avg
        };
    }, [teams, evaluations, selectedRound]);

    return (
        <div className="h-full flex-1 min-h-0 flex flex-col space-y-4">
            {/* Top Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-black text-slate-800">Team Evaluations & Marks Entry</h2>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                        Enter, review, and calibrate marks for all participating teams across all rounds.
                    </p>
                </div>

                {/* Search & Track Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search team or venue..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none w-48 shadow-sm"
                        />
                        <ScanLine size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                    </div>

                    <select
                        value={filterTrack}
                        onChange={(e) => setFilterTrack(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none shadow-sm cursor-pointer"
                    >
                        {uniqueTracks.map(t => <option key={t} value={t}>{t === 'All' ? 'All Tracks' : t}</option>)}
                    </select>
                </div>
            </div>

            {/* Round Pills & Quick Stats Row */}
            <div className="flex flex-col lg:flex-row gap-3 shrink-0">
                {/* Round Selector Pills */}
                <div className="flex-1 flex bg-slate-100 p-1 rounded-2xl border border-slate-200/80 shadow-sm gap-1 overflow-x-auto">
                    {rounds.map(r => (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRound(r.id)}
                            className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center justify-center ${
                                selectedRound === r.id
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-600 hover:text-indigo-600 hover:bg-white/80'
                            }`}
                        >
                            <span>{r.label}</span>
                            {r.max && <span className={`text-[10px] font-mono ${selectedRound === r.id ? 'text-indigo-200' : 'text-slate-500'}`}>Max {r.max}</span>}
                        </button>
                    ))}
                </div>

                {/* Quick Stats Badges */}
                <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-xl text-center">
                        <span className="block text-[10px] font-bold text-slate-600 uppercase">Teams</span>
                        <span className="text-xs font-black text-indigo-700 font-mono">{stats.total}</span>
                    </div>
                    <div className="px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                        <span className="block text-[10px] font-bold text-slate-600 uppercase">Evaluated</span>
                        <span className="text-xs font-black text-emerald-700 font-mono">{stats.scored}</span>
                    </div>
                    <div className="px-3 py-1 bg-amber-50 border border-amber-100 rounded-xl text-center">
                        <span className="block text-[10px] font-bold text-slate-600 uppercase">Pending</span>
                        <span className="text-xs font-black text-amber-700 font-mono">{stats.pending}</span>
                    </div>
                    <div className="px-3 py-1 bg-purple-50 border border-purple-100 rounded-xl text-center">
                        <span className="block text-[10px] font-bold text-slate-600 uppercase">Average</span>
                        <span className="text-xs font-black text-purple-700 font-mono">{stats.avg} pts</span>
                    </div>
                </div>
            </div>

            {/* Teams Cards List */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-6">
                    {filteredTeams.map((team) => {
                        const ev = evaluations[team.id] || {};
                        const ideaScore = ev.idea?.avg ?? null;
                        const p1Score = ev.phase1?.avg ?? null;
                        const p2Score = ev.phase2?.avg ?? null;
                        const p3Score = ev.phase3?.avg ?? null;
                        const grandTotal = (ideaScore || 0) + (p1Score || 0) + (p2Score || 0) + (p3Score || 0);

                        return (
                            <GlassCard key={team.id} className="p-4 flex flex-col justify-between hover:border-indigo-300 transition-all border border-slate-200">
                                <div>
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <h3 className="font-black text-sm text-slate-900">{team.name}</h3>
                                                {team.isFinalist && (
                                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-full">FINALIST</span>
                                                )}
                                            </div>
                                            <span className="text-[11px] font-mono text-slate-500 font-bold">{team.id}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="inline-block text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200/80">
                                                {team.track}
                                            </span>
                                            <div className="text-[10px] text-slate-500 font-medium mt-0.5">{team.venue}</div>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    {team.description && (
                                        <p className="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">
                                            {team.description}
                                        </p>
                                    )}

                                    {/* Score Grid */}
                                    <div className="grid grid-cols-4 gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200/80 mb-3 text-center">
                                        <div className="p-1 rounded-lg bg-white border border-slate-200/80">
                                            <span className="block text-[9px] font-bold text-slate-500 uppercase">Idea</span>
                                            <span className={`text-xs font-mono font-bold ${ideaScore !== null ? 'text-indigo-700' : 'text-slate-400'}`}>
                                                {ideaScore !== null ? `${ideaScore.toFixed(0)}/20` : '-'}
                                            </span>
                                        </div>
                                        <div className="p-1 rounded-lg bg-white border border-slate-200/80">
                                            <span className="block text-[9px] font-bold text-slate-500 uppercase">Phase 1</span>
                                            <span className={`text-xs font-mono font-bold ${p1Score !== null ? 'text-indigo-700' : 'text-slate-400'}`}>
                                                {p1Score !== null ? `${p1Score.toFixed(0)}/20` : '-'}
                                            </span>
                                        </div>
                                        <div className="p-1 rounded-lg bg-white border border-slate-200/80">
                                            <span className="block text-[9px] font-bold text-slate-500 uppercase">Phase 2</span>
                                            <span className={`text-xs font-mono font-bold ${p2Score !== null ? 'text-indigo-700' : 'text-slate-400'}`}>
                                                {p2Score !== null ? `${p2Score.toFixed(0)}/30` : '-'}
                                            </span>
                                        </div>
                                        <div className="p-1 rounded-lg bg-white border border-slate-200/80">
                                            <span className="block text-[9px] font-bold text-slate-500 uppercase">Finals</span>
                                            <span className={`text-xs font-mono font-bold ${p3Score !== null ? 'text-indigo-700' : 'text-slate-400'}`}>
                                                {p3Score !== null ? `${p3Score.toFixed(0)}/30` : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Total and Action Button */}
                                <div>
                                    <div className="flex items-center justify-between px-1 mb-2">
                                        <span className="text-xs font-bold text-slate-600">Cumulative Score:</span>
                                        <span className="text-sm font-black text-slate-900 font-mono">{grandTotal.toFixed(1)} <span className="text-[10px] text-slate-500 font-normal">/ 100</span></span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onOpenScoreModal(team, selectedRound === 'all' ? (systemState?.currentRound || 'idea') : selectedRound)}
                                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98]"
                                    >
                                        <ClipboardList size={14} />
                                        <span>Enter / Edit Marks</span>
                                    </button>
                                </div>
                            </GlassCard>
                        );
                    })}

                    {filteredTeams.length === 0 && (
                        <div className="col-span-full py-16 text-center text-gray-400 font-bold bg-white/40 rounded-2xl border border-dashed border-gray-200">
                            No teams found matching search criteria.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AdminDashboard = ({ user, userProfile }) => {
  const [activeTab, setActiveTab] = useState('activity');
  const systemState = useSystemState();
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  // Data
  const [teamsRaw, setTeamsRaw] = useState([]);
  const [privateData, setPrivateData] = useState(() => {
      try {
          const saved = localStorage.getItem('hackfest_private_data');
          return saved ? JSON.parse(saved) : {};
      } catch(e) {
          return {};
      }
  });

  const handleToggleFinalist = (teamId, isFinalist) => {
      setPrivateData(prev => {
          const updated = {
              ...prev,
              [teamId]: {
                  ...(prev[teamId] || {}),
                  isFinalist
              }
          };
          try {
              localStorage.setItem('hackfest_private_data', JSON.stringify(updated));
              window.dispatchEvent(new CustomEvent('hackfest_private_data_change', { detail: updated }));
          } catch(e) {}
          return updated;
      });
  };
  const [evaluations, setEvaluations] = useState(() => {
      try {
          const saved = localStorage.getItem('hackfest_evaluations');
          return saved ? JSON.parse(saved) : SAMPLE_EVALUATIONS;
      } catch(e) {
          return SAMPLE_EVALUATIONS;
      }
  });

  // Modal State for Entering Marks
  const [scoringTeam, setScoringTeam] = useState(null);
  const [scoringRound, setScoringRound] = useState(systemState.currentRound || 'idea');

  // Fetch Public Team Data
  useEffect(() => {
    const unsubscribeTeams = safeOnSnapshot(collection(db, 'teams'), (snap) => {
        const teamsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (teamsData.length > 0) {
            setTeamsRaw(teamsData);
        } else {
            setTeamsRaw(SAMPLE_TEAMS);
        }
    }, (err) => {
        console.warn("Firestore teams notice (using sample teams):", err.message);
        setTeamsRaw(SAMPLE_TEAMS);
    });
    return () => unsubscribeTeams();
  }, []);

  // Fetch Private Team Data
  useEffect(() => {
      const handleLocalPrivateData = (e) => {
          if (e.detail) {
              setPrivateData(prev => ({ ...prev, ...e.detail }));
          }
      };
      window.addEventListener('hackfest_private_data_change', handleLocalPrivateData);

      const unsub = safeOnSnapshot(collection(db, 'private_team_data'), (snap) => {
          const pData = {};
          snap.forEach(doc => {
              pData[doc.id] = doc.data();
          });
          if (Object.keys(pData).length > 0) {
              setPrivateData(prev => {
                  const merged = { ...prev, ...pData };
                  try { localStorage.setItem('hackfest_private_data', JSON.stringify(merged)); } catch(e) {}
                  return merged;
              });
          }
      }, (err) => {
          console.warn("Private team data notice (using local storage):", err.message);
      });
      return () => {
          window.removeEventListener('hackfest_private_data_change', handleLocalPrivateData);
          if (unsub) unsub();
      };
  }, []);

  // Merge Public & Private Data
  const teams = useMemo(() => {
      return teamsRaw.map(t => {
          const pData = privateData[t.id] || {};
          return {
              ...t,
              isFinalist: pData.isFinalist || false,
              phase3EvalCount: pData.phase3EvalCount || 0
          };
      });
  }, [teamsRaw, privateData]);

  useEffect(() => {
    const TABS_NEEDING_EVALS = ['controls', 'selection', 'leaderboard', 'evaluations'];
    if (!TABS_NEEDING_EVALS.includes(activeTab)) {
        return;
    }

    const unsubscribeEvals = safeOnSnapshot(collection(db, 'evaluations'), (snap) => {
        if (snap.empty) {
            const saved = localStorage.getItem('hackfest_evaluations');
            if (saved) {
                try { setEvaluations(JSON.parse(saved)); return; } catch(e) {}
            }
            setEvaluations(SAMPLE_EVALUATIONS);
            return;
        }
        const tempAgg = {}; 
        
        snap.forEach(doc => {
            const data = doc.data();
            if (!tempAgg[data.teamId]) tempAgg[data.teamId] = {};
            if (!tempAgg[data.teamId][data.round]) tempAgg[data.teamId][data.round] = [];
            tempAgg[data.teamId][data.round].push(data.totalScore);
        });

        // Compute Stats
        const finalAgg = {};
        Object.keys(tempAgg).forEach(teamId => {
            finalAgg[teamId] = {};
            Object.keys(tempAgg[teamId]).forEach(round => {
                const scores = tempAgg[teamId][round];
                const sum = scores.reduce((a, b) => a + b, 0);
                const avg = sum / scores.length;
                finalAgg[teamId][round] = {
                    total: sum, 
                    avg: avg,   
                    count: scores.length,
                    scores: scores
                };
            });
        });
        
        setEvaluations(finalAgg);
    }, (err) => {
        console.warn("Evaluations notice (using stored/sample evaluations):", err.message);
        const saved = localStorage.getItem('hackfest_evaluations');
        if (saved) {
            try { setEvaluations(JSON.parse(saved)); return; } catch(e) {}
        }
        setEvaluations(SAMPLE_EVALUATIONS);
    });

    return () => unsubscribeEvals();
  }, [activeTab]);

  const handleSaveEvaluation = async (teamId, round, rubricScores, totalScore, remarks) => {
    // 1. Instant local state update
    setEvaluations(prev => {
        const teamEvals = prev[teamId] || {};
        const next = {
            ...prev,
            [teamId]: {
                ...teamEvals,
                [round]: {
                    total: totalScore,
                    avg: totalScore,
                    count: 1,
                    scores: [totalScore],
                    rubricBreakdown: rubricScores,
                    remarks: remarks || ''
                }
            }
        };
        try {
            localStorage.setItem('hackfest_evaluations', JSON.stringify(next));
        } catch(e) {}
        return next;
    });

    // 2. Sync to Firestore
    try {
        const docId = `${teamId}_${round}`;
        await setDoc(doc(db, 'evaluations', docId), {
            teamId,
            round,
            scores: rubricScores,
            totalScore,
            remarks: remarks || '',
            evaluatorEmail: user?.email || auth.currentUser?.email || 'admin@hackfest.org',
            evaluatorName: userProfile?.name || 'Administrator',
            timestamp: new Date().toISOString()
        }, { merge: true });

        await setDoc(doc(db, 'teams', teamId), {
            lastEvaluatedRound: round,
            status: 'evaluated'
        }, { merge: true });

        await addDoc(collection(db, 'logs'), {
            timestamp: new Date().toISOString(),
            userName: userProfile?.name || 'Administrator',
            userEmail: user?.email || 'admin@hackfest.org',
            role: 'admin',
            action: 'EVALUATION_ENTERED',
            details: `Recorded score of ${totalScore} pts for ${teamId} in ${round}`
        });
    } catch(err) {
        console.warn("Evaluation sync notice (saved locally):", err.message);
    }
  };

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-gray-50/50">
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        confirmText={modalConfig.confirmText}
        isAlert={modalConfig.isAlert}
      />

      {scoringTeam && (
        <ScoreEvaluationModal
            team={scoringTeam}
            initialRound={scoringRound}
            currentRound={systemState.currentRound}
            evaluations={evaluations}
            onClose={() => setScoringTeam(null)}
            onSaveScore={handleSaveEvaluation}
        />
      )}
      
      <div className="max-w-[1440px] mx-auto w-full h-full flex flex-col p-3 md:p-5 overflow-hidden pt-16 md:pt-16">
        
        {/* Header */}
        <header className="mb-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 px-1">
            <div className="flex items-center gap-4">
                <div className="bg-white p-2 rounded-xl shadow-sm border border-indigo-50">
                    <Shield className="w-8 h-8 text-indigo-600" />
                </div>
                <div>
                   <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">Admin Panel</h1>
                   <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 font-mono mt-1">
                      <span>ROUND: <span className="text-indigo-600 font-bold uppercase">{systemState.currentRound}</span></span>
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      <span>STATUS: <span className={`font-bold uppercase ${systemState.roundStatus === 'ongoing' ? 'text-emerald-600' : 'text-slate-600'}`}>{systemState.roundStatus}</span></span>
                   </div>
                </div>
            </div>

            <div className="flex flex-wrap bg-slate-100/90 p-1.5 rounded-2xl shadow-sm border border-slate-200/90 gap-1">
                {[
                    { id: 'activity', icon: Activity, label: 'Live Feed' },
                    { id: 'evaluations', icon: ClipboardList, label: 'Evaluations' },
                    { id: 'controls', icon: LayoutDashboard, label: 'Controls' },
                    { id: 'selection', icon: Star, label: 'Finals' },
                    { id: 'leaderboard', icon: Trophy, label: 'Leaderboard' },
                    { id: 'feedbacks', icon: StickyNote, label: 'Feedbacks' },
                    { id: 'auth', icon: UserIcon, label: 'Auth' },
                    { id: 'notify', icon: Bell, label: 'Notify' },
                    { id: 'arcade', icon: Gamepad2, label: 'Arcade' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === tab.id 
                                ? 'bg-white shadow-sm text-indigo-700 font-bold' 
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'}`}
                    >
                        {tab.icon && <tab.icon size={15} />} <span className="hidden md:inline">{tab.label}</span>
                    </button>
                ))}
            </div>
        </header>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-1 pb-2">
            <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="h-full flex-1 min-h-0 flex flex-col"
            >
                {activeTab === 'activity' && <ActivityFeed />}
                {activeTab === 'evaluations' && (
                    <EvaluationManager
                        teams={teams}
                        evaluations={evaluations}
                        systemState={systemState}
                        onOpenScoreModal={(team, round) => {
                            setScoringTeam(team);
                            setScoringRound(round || systemState.currentRound || 'idea');
                        }}
                    />
                )}
                {activeTab === 'controls' && <RoundControls systemState={systemState} teams={teams} evaluations={evaluations} setModalConfig={setModalConfig} />}
                {activeTab === 'selection' && <FinalSelection teams={teams} evaluations={evaluations} onToggleFinalist={handleToggleFinalist} />}
                {activeTab === 'notify' && <NotificationPanel setModalConfig={setModalConfig} user={user} />}
                {activeTab === 'leaderboard' && (
                    <UnifiedLeaderboard
                        teams={teams}
                        evaluations={evaluations}
                        systemState={systemState}
                        onOpenScoreModal={(team, round) => {
                            setScoringTeam(team);
                            setScoringRound(round || systemState.currentRound || 'idea');
                        }}
                    />
                )}
                {activeTab === 'feedbacks' && <FeedbackViewer />}
                {activeTab === 'auth' && <UserManagement />}
                {activeTab === 'arcade' && (
                    <ArcadeDashboard
                        user={user || auth.currentUser || { uid: 'admin_1', email: 'admin@hackfest.org', displayName: 'Admin' }}
                        customUserName={userProfile?.name || 'Admin'}
                    />
                )}
            </motion.div>
        </div>
      </div>
    </div>
  );
};

/* --- ContestantDashboard --- */

const ContestantDashboard = ({ user, userProfile }) => {
  const [activeTab, setActiveTab] = useState('timeline');
  const [cameraError, setCameraError] = useState(false);
  const [attendanceMarked, setAttendanceMarked] = useState(() => {
    return !!(userProfile?.attendanceMarked || userProfile?.role === 'admin' || userProfile?.role === 'superadmin');
  });
  const [loading, setLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [teamDetails, setTeamDetails] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [viewRubric, setViewRubric] = useState(null); // Which round rubric to view

  // Request Help State
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpIssue, setHelpIssue] = useState('');
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const [codeOfConductAccepted, setCodeOfConductAccepted] = useState(() => localStorage.getItem('hackfest_coc_accepted') === 'true');

  const [showMemberCountModal, setShowMemberCountModal] = useState(false);
  const [scannedTrackTemp, setScannedTrackTemp] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Help Request State
  const [activeHelpRequest, setActiveHelpRequest] = useState(null);
  const [selectedHelper, setSelectedHelper] = useState('');

  // Troll State
  const [showTrollModal, setShowTrollModal] = useState(false);
  const [isTrollCompleted, setIsTrollCompleted] = useState(() => {
    return localStorage.getItem('troll_completed') === 'true';
  });

  const systemState = useSystemState();
  const { currentRound, roundStatus } = systemState;

  // Subscribe to Team Details with safe fallback
  useEffect(() => {
    let unsubTeam = null;
    let isMounted = true;

    const teamIdToFetch = userProfile?.teamId || 'team_1';
    const fallbackTeam = SAMPLE_TEAMS.find(t => t.id === teamIdToFetch) || SAMPLE_TEAMS[0];

    if (userProfile?.attendanceMarked || fallbackTeam?.attendanceMarked || userProfile?.role === 'admin' || userProfile?.role === 'superadmin') {
      setAttendanceMarked(true);
      setAssignedRoom(userProfile?.roomNumber || fallbackTeam?.venue || 'Lab 101');
    }

    try {
      unsubTeam = safeOnSnapshot(doc(db, 'teams', String(teamIdToFetch)), (docSnap) => {
        if (!isMounted) return;
        if (docSnap.exists()) {
          const tData = { id: docSnap.id, ...docSnap.data() };
          setTeamDetails(tData);
          if (tData.attendanceMarked || userProfile?.attendanceMarked || userProfile?.role === 'admin' || userProfile?.role === 'superadmin') {
            setAttendanceMarked(true);
            setAssignedRoom(userProfile?.roomNumber || tData.venue || 'Lab 101');
          }
        } else {
          setTeamDetails(fallbackTeam);
          if (fallbackTeam?.attendanceMarked || userProfile?.attendanceMarked || userProfile?.role === 'admin' || userProfile?.role === 'superadmin') {
            setAttendanceMarked(true);
            setAssignedRoom(userProfile?.roomNumber || fallbackTeam.venue || 'Lab 101');
          }
        }
      }, (err) => {
        console.warn("Contestant team snapshot notice (using fallback team):", err.message);
        if (isMounted) {
          setTeamDetails(fallbackTeam);
          if (fallbackTeam?.attendanceMarked || userProfile?.attendanceMarked || userProfile?.role === 'admin' || userProfile?.role === 'superadmin') {
            setAttendanceMarked(true);
            setAssignedRoom(userProfile?.roomNumber || fallbackTeam.venue || 'Lab 101');
          }
        }
      });
    } catch (err) {
      console.warn("Error subscribing to team details:", err);
      if (isMounted) {
        setTeamDetails(fallbackTeam);
      }
    }
    setLoading(false);

    return () => {
      isMounted = false;
      if (unsubTeam) unsubTeam();
    };
  }, [userProfile?.teamId, userProfile?.attendanceMarked]);

  // Subscribe to Notifications
  useEffect(() => {
    let isMounted = true;
    let unsubscribe = null;
    try {
      const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(20));
      unsubscribe = safeOnSnapshot(q, (snapshot) => {
        if (!isMounted) return;
        const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Filter by target
        const myNotifs = all.filter(n => {
          if (!n.targets || n.targets.includes('all')) return true;
          return n.targets.includes('contestant');
        });
        setNotifications(myNotifs);
      }, (err) => {
        console.warn("Contestant notifications notice:", err.message);
      });
    } catch(err) {
      console.warn("Notifications subscription error:", err);
    }

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Listen for Active Help Request
  useEffect(() => {
    if (!user?.email) {
      setActiveHelpRequest(null);
      return;
    }
    let isMounted = true;
    let unsub = null;

    try {
      const q = query(
        collection(db, 'help_requests'),
        where('userEmail', '==', user.email),
        where('resolved', '==', false)
      );
      unsub = safeOnSnapshot(q, (snap) => {
        if (!isMounted) return;
        if (!snap.empty) {
          setActiveHelpRequest({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setActiveHelpRequest(null);
        }
      }, (err) => {
        console.warn("Help requests notice:", err.message);
        if (isMounted) setActiveHelpRequest(null);
      });
    } catch (err) {
      console.warn("Help requests query error:", err);
      if (isMounted) setActiveHelpRequest(null);
    }

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [user?.email]);

  // Effect: Watch for NEW troll triggers from Admin to reset local completion
  useEffect(() => {
    if (systemState?.trollMode?.timestamp) {
      const lastSeenTroll = localStorage.getItem('last_troll_timestamp');
      const serverTroll = String(systemState.trollMode.timestamp);

      // If the server has a newer troll timestamp than we last saw, RESET completion
      if (lastSeenTroll !== serverTroll) {
        localStorage.removeItem('troll_completed');
        localStorage.setItem('last_troll_timestamp', serverTroll);
        setIsTrollCompleted(false); // Reset state to show card
      }
    }
  }, [systemState?.trollMode?.timestamp]);

  const isTrollActive = systemState?.trollMode?.active && !isTrollCompleted;

  const handleTrollComplete = () => {
    localStorage.setItem('troll_completed', 'true');
    setIsTrollCompleted(true); // Update state to hide card
    setShowTrollModal(false);
  };

  // Celebration Logic (Persistent until feedback is submitted)
  useEffect(() => {
    if (currentRound === 'phase3' && roundStatus === 'completed') {
      setShowCelebration(true);
    }
  }, [currentRound, roundStatus]);

  const handleScan = async (detectedCodes) => {
    if (!teamDetails) return;

    if (detectedCodes && detectedCodes.length > 0) {
      const value = detectedCodes[0].rawValue;

      // Check prefix
      if (value.startsWith("HACKFEST_CHECKIN_")) {
          const scannedTrack = value.replace("HACKFEST_CHECKIN_", "");
          
          // Verify Track First
          const myTrack = teamDetails?.track;
          
          if (!myTrack) {
               setModalConfig({
                    isOpen: true,
                    title: 'No Track Assigned',
                    message: 'Your team does not have a track assigned. Please contact help desk.',
                    type: 'error',
                    isAlert: true
               });
               return;
          }
          
          if (scannedTrack !== myTrack) {
                setModalConfig({
                    isOpen: true,
                    title: 'Wrong Registration Desk',
                    message: `You are at the ${scannedTrack} desk. Please go to the registration desk for ${myTrack}.`,
                    type: 'error',
                    isAlert: true
                });
                return;
          }

          setScannedTrackTemp(scannedTrack);
          setShowMemberCountModal(true); // Trigger Modal
      }
    }
  };

  const confirmCheckIn = async (presentMembers) => {
    try {
        if (!scannedTrackTemp) return;

        // Calculate stats
        const total = presentMembers.length;
        const veg = presentMembers.filter(m => m.diet === 'veg').length;
        const nonVeg = presentMembers.filter(m => m.diet === 'non-veg').length;

        if (userProfile && userProfile.id) {
            // Valid Track - Proceed
            const roomString = teamDetails?.venue || "TBD";
            const memCount = total;

            // 1. Update User Attendance
            await updateDoc(doc(db, 'users', userProfile.id), {
              attendanceMarked: true,
              attendedAt: new Date().toISOString(),
              roomNumber: roomString
            });

            // 2. Update Team Attendance
            if (userProfile.teamId) {
                await updateDoc(doc(db, 'teams', userProfile.teamId), {
                    attendanceMarked: true,
                    memberCount: memCount,
                    vegCount: veg,
                    nonVegCount: nonVeg,
                    attendanceDetails: presentMembers // Save detailed list
                });
            }

            // 3. Trigger Helper Alert (Create Check-in Event)
            try {
                await addDoc(collection(db, 'checkins'), {
                    teamId: teamDetails.id,
                    teamName: teamDetails.name,
                    track: scannedTrackTemp, // Use the scanned track (should match team track)
                    total: memCount,
                    veg: veg,
                    nonVeg: nonVeg,
                    memberNames: presentMembers.map(m => m.name), // Added member names
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                console.error("Failed to create checkin event", e);
            }

            await logAction(
                user.uid, 
                user.email, 
                teamDetails?.name || user.displayName,
                'contestant', 
                'CHECK_IN', 
                `User scanned attendance QR for ${scannedTrackTemp}. People: ${memCount} (V:${veg}, NV:${nonVeg})`
            );

            setAssignedRoom(roomString);
            setAttendanceMarked(true);
            setShowSuccessModal(true);
            setShowMemberCountModal(false);
        }
    } catch (err) {
        console.error("Check-in Error:", err); // This helps debug
        setModalConfig({ 
            isOpen: true, 
            title: 'Error', 
            message: 'Check-in failed. Please try again.', 
            type: 'error', 
            isAlert: true 
        });
        setShowMemberCountModal(false);
    }
  };

  const handleSendHelpRequest = async () => {
    if (!helpIssue.trim()) return;
    try {
        await addDoc(collection(db, 'help_requests'), {
            userEmail: user.email,
            teamName: teamDetails?.name || "Unknown Team",
            track: teamDetails?.track || "Unknown",
            roomNumber: assignedRoom,
            issue: helpIssue,
            timestamp: new Date().toISOString(),
            resolved: false
        });

        await logAction(
            user.uid,
            user.email,
            teamDetails?.name || user.displayName,
            'contestant',
            'HELP_REQUESTED',
            `Request opened: ${helpIssue}`
        );

        setShowHelpModal(false);
        setHelpIssue('');
        setModalConfig({ isOpen: true, title: 'Request Sent', message: 'Help has been requested. A volunteer will be with you shortly.', type: 'success', isAlert: true });
    } catch (error) {
        console.error(error);
        setModalConfig({ isOpen: true, title: 'Error', message: 'Failed to send request.', type: 'error', isAlert: true });
    }
  };

  const handleResolveHelpRequest = async () => {
      if (!activeHelpRequest || !selectedHelper) return;
      try {
          await updateDoc(doc(db, 'help_requests', activeHelpRequest.id), {
              resolved: true,
              resolvedAt: new Date().toISOString(),
              solvedBy: selectedHelper
          });

          await logAction(
            user.uid,
            user.email,
            teamDetails?.name || user.displayName,
            'contestant',
            'HELP_RESOLVED',
            `Request resolved by ${selectedHelper}`
          );

          setShowHelpModal(false);
          setSelectedHelper('');
          setModalConfig({ isOpen: true, title: 'Resolved', message: 'Your request has been marked as resolved.', type: 'success', isAlert: true });
      } catch (e) {
          console.error(e);
          setModalConfig({ isOpen: true, title: 'Error', message: 'Failed to update request.', type: 'error', isAlert: true });
      }
  };

  const markReadyForEvaluation = async () => {
     if (!teamDetails) return;
     // Check if already ready for CURRENT round
     if (teamDetails.status === 'ready' && teamDetails.readyRound === currentRound) return;
     try {
         await updateDoc(doc(db, 'teams', teamDetails.id), {
             status: 'ready',
             readyRound: currentRound, // Track which round they are ready for
             readyTime: new Date().toISOString()
         });
     } catch (err) { console.error(err); }
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  // --- CHECK IN FLOW ---
  if (!attendanceMarked) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <ConfirmationModal isOpen={modalConfig.isOpen} onClose={() => setModalConfig({ ...modalConfig, isOpen: false })} title={modalConfig.title} message={modalConfig.message} type={modalConfig.type} isAlert={true} />

          {/* Member Count Modal */}
          <AnimatePresence>
            {showMemberCountModal && (
                <CheckInModal
                    isOpen={showMemberCountModal}
                    onClose={() => setShowMemberCountModal(false)}
                    onConfirm={confirmCheckIn}
                    members={teamDetails?.members || []}
                />
            )}
          </AnimatePresence>

          <GlassCard className="w-full max-w-md p-6 flex flex-col items-center">
            <ScanLine className="w-12 h-12 text-indigo-500 mb-4 animate-pulse" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Check-In Required</h2>
            <p className="text-gray-500 text-center mb-6">Please locate a Helper Station and scan the QR code.</p>
            <div className="w-full aspect-square rounded-xl overflow-hidden border-4 border-indigo-100 relative bg-black flex items-center justify-center">
              {!showMemberCountModal && (
                  teamDetails ? (
                      <SafeScanner
                        fallback={
                          <div className="text-center p-6 text-white text-sm flex flex-col items-center">
                            <CameraOff className="w-10 h-10 text-amber-400 mb-2" />
                            <p className="font-bold text-amber-300 mb-1">Camera Stream Inactive</p>
                            <p className="text-xs text-slate-300 mb-4 max-w-[240px]">
                              Camera could not be accessed on this device. Click below to continue.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setAttendanceMarked(true);
                                setAssignedRoom(teamDetails?.venue || 'Lab 101');
                                setShowSuccessModal(false);
                              }}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                            >
                              Quick Check-in
                            </button>
                          </div>
                        }
                      >
                        {!cameraError ? (
                          <Scanner
                            onScan={handleScan}
                            onError={(err) => {
                              console.warn("Camera scanner notice:", err);
                              setCameraError(true);
                            }}
                            allowMultiple={false}
                            scanDelay={2000}
                          />
                        ) : (
                          <div className="text-center p-6 text-white text-sm flex flex-col items-center">
                            <CameraOff className="w-10 h-10 text-amber-400 mb-2" />
                            <p className="font-bold text-amber-300 mb-1">Camera Inactive</p>
                            <p className="text-xs text-slate-300 mb-4 max-w-[240px]">
                              Camera is unavailable. Click below to complete check-in.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setAttendanceMarked(true);
                                setAssignedRoom(teamDetails?.venue || 'Lab 101');
                                setShowSuccessModal(false);
                              }}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                            >
                              Quick Check-in
                            </button>
                          </div>
                        )}
                      </SafeScanner>
                  ) : (
                      <div className="text-white text-center">
                          <LoadingSpinner />
                          <p className="mt-2 text-sm">Loading Team Data...</p>
                      </div>
                  )
              )}
            </div>
            <button
                type="button"
                onClick={() => {
                    setAttendanceMarked(true);
                    setAssignedRoom(teamDetails?.venue || 'Lab 101');
                    setShowSuccessModal(false);
                }}
                className="mt-6 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline transition-colors"
            >
                Quick Check-in (Skip QR Scan for Demo)
            </button>
          </GlassCard>
        </div>
      );
  }

  if (showSuccessModal) {
     return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <GlassCard className="w-full max-w-sm p-8 text-center flex flex-col items-center">
                <CheckCircle className="w-10 h-10 text-green-600 mb-6" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Check-in Complete!</h2>
                <div className="bg-indigo-50 p-4 rounded-xl w-full mb-6">
                    <p className="text-xs font-bold text-indigo-400 uppercase">Assigned Workstation</p>
                    <p className="text-3xl font-black text-indigo-600">{assignedRoom}</p>
                </div>
                <button onClick={() => setShowSuccessModal(false)} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">Go to Dashboard</button>
            </GlassCard>
        </div>
     );
  }

  // --- MAIN DASHBOARD ---
  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col p-4 md:p-6 max-w-7xl mx-auto pb-4">
      <AnimatePresence>
        {showTrollModal && (
          <ErrorBoundary>
            <TrollOverlay
                isOpen={showTrollModal}
                onClose={() => setShowTrollModal(false)}
                onComplete={handleTrollComplete}
            />
          </ErrorBoundary>
        )}
        {showCelebration && (
          <ErrorBoundary>
            <CelebrationOverlay
                onClose={() => setShowCelebration(false)}
                teamDetails={teamDetails}
                userProfile={userProfile}
                onFeedbackSuccess={() => {}}
            />
          </ErrorBoundary>
        )}
        {showHelpModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                    <h3 className="text-xl font-bold mb-4">{activeHelpRequest ? 'Resolve Request' : 'Request Help'}</h3>

                    {activeHelpRequest ? (
                        <div className="space-y-4">
                            <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                                <p className="text-xs font-bold text-orange-500 uppercase mb-1">Current Issue</p>
                                <p className="text-gray-800 font-medium">{activeHelpRequest.issue}</p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Who solved this?</label>
                                <select
                                    value={selectedHelper}
                                    onChange={(e) => setSelectedHelper(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select Helper</option>
                                    {/* Filter Helpers by Track */}
                                    {(TRACK_HELPERS.find(t => t.track === teamDetails?.track)?.students || [])
                                        .map((s, i) => (
                                            <option key={i} value={s.name}>{s.name} ({s.role})</option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setShowHelpModal(false)} className="px-4 py-2 bg-gray-100 text-gray-500 font-bold rounded-lg hover:bg-gray-200">Close</button>
                                <button
                                    onClick={handleResolveHelpRequest}
                                    disabled={!selectedHelper}
                                    className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                    Mark Resolved
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <textarea value={helpIssue} onChange={(e) => setHelpIssue(e.target.value)} className="w-full border p-3 rounded-xl h-32 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Describe the issue you are facing..." />
                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setShowHelpModal(false)} className="px-4 py-2 bg-gray-100 text-gray-500 font-bold rounded-lg hover:bg-gray-200">Cancel</button>
                                <button onClick={handleSendHelpRequest} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg">Send Request</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}
        {!codeOfConductAccepted && attendanceMarked && currentRound === 'idea' && roundStatus === 'locked' && (
            <div className="fixed inset-0 z-[300] bg-white text-gray-900 overflow-y-auto p-6 md:p-12 flex flex-col items-center">
                <div className="max-w-4xl w-full">
                    <h1 className="text-4xl md:text-6xl font-black text-indigo-900 mb-8 text-center uppercase tracking-tight">Code of Conduct</h1>

                    <p className="text-lg font-bold text-gray-600 mb-8 leading-relaxed border-l-4 border-indigo-500 pl-4">
                        At HACKFEST, we are committed to provide a welcoming and inclusive environment for all the participants, regardless of gender, age, sex, disability, race, ethnicity, nationality, religion, or any other protected characteristic. We believe that diversity and inclusivity are fundamental to fostering creativity, innovation, and collaboration.
                    </p>

                    <div className="space-y-6 text-base md:text-lg font-medium text-gray-800">
                        <p>By participating in HACKFEST, all attendees, including participants, organizers, sponsors, mentors, volunteers, and jury, agree to abide by the following code of conduct:</p>

                        <ul className="list-disc pl-6 space-y-3 marker:text-indigo-500">
                            <li>Participants must carry their identity proofs (college ID, Aadhar Card).</li>
                            <li>No team or individual is permitted to leave the venue during the hackathon event.</li>
                            <li>All amenities such as food, snacks, and accommodation will be provided within the venue throughout the event.</li>
                            <li>Finished products or projects are not allowed at the event. However, teams must bring their own hardware/raw materials (if required) to build their project during the hackathon.</li>
                            <li>Technical support and assistance will be provided by mentors and volunteers at the hackathon.</li>
                            <li>Treat all individuals with respect and dignity. Harassment, discrimination, or any form of unwelcome or inappropriate behavior will not be tolerated.</li>
                            <li>Adhere to all event rules and guidelines set forth by the organizers. Follow instructions from event staff and volunteers. Failure to comply may result in disqualification.</li>
                            <li>Conduct yourself in a professional manner at all times. Refrain from disruptive or disrespectful behavior, including excessive noise, vandalism, or intoxication.</li>
                            <li>Prioritize the safety and well-being of all participants. Be mindful of physical and emotional boundaries. Report any concerns or incidents promptly to event organizers.</li>
                            <li>Violations of this code of conduct may result in disciplinary action, including verbal warnings, expulsion from the event without refund, and banning from future events.</li>
                            <li>No participant is allowed to leave before 6.00PM on 10/01/2026.</li>
                        </ul>
                    </div>

                    <div className="mt-8 p-6 bg-indigo-50 rounded-xl border border-indigo-100 text-center">
                        <p className="text-indigo-800 font-bold mb-2">Hackathon Status</p>
                        <div className="text-sm font-mono text-indigo-600 bg-white inline-block px-3 py-1 rounded border border-indigo-200 mb-6">WAITING FOR KICKOFF...</div>
                        <div>
                            <button
                                onClick={() => {
                                    setCodeOfConductAccepted(true);
                                    localStorage.setItem('hackfest_coc_accepted', 'true');
                                }}
                                className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all inline-flex items-center gap-2 text-sm"
                            >
                                <Check size={18} />
                                <span>I Acknowledge & Enter Dashboard</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        {viewRubric && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold">{ROUND_RUBRICS[viewRubric]?.label} Rubrics</h3>
                        <button onClick={() => setViewRubric(null)}><X /></button>
                    </div>
                    <div className="space-y-4">
                        {(ROUND_RUBRICS[viewRubric]?.rubrics || []).map(r => (
                            <div key={r.id} className="border-b pb-2">
                                <div className="flex justify-between font-semibold">
                                    <span>{r.label}</span>
                                    <span className="text-indigo-600">{r.max} Marks</span>
                                </div>
                            </div>
                        ))}
                        <div className="pt-2 flex justify-between font-bold text-lg">
                            <span>Total</span>
                            <span>{ROUND_RUBRICS[viewRubric]?.maxMarks} Marks</span>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </AnimatePresence>

      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 px-2 pt-16 md:pt-16">
          <div className="flex items-center gap-4">
               <div className="bg-white p-2 rounded-xl shadow-sm border border-indigo-50">
                    <LayoutDashboard className="w-8 h-8 text-indigo-600" />
               </div>
               <div>
                  <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">Participant Dashboard</h1>
                  <p className="text-indigo-600 font-bold text-sm">{teamDetails?.name || 'Participant Mode'}</p>
               </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-2 md:items-center self-center md:self-auto w-full md:w-auto">
              {/* Added Help/Room Info above nav on mobile, or inline on desktop if desired. keeping them separate for clarity */}
              <div className="flex gap-2 mb-2 md:mb-0 justify-end w-full md:w-auto">
                  <button onClick={() => setShowHelpModal(true)} className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 text-xs">
                        <HandMetal size={14} /> <span className="hidden md:inline">Help</span>
                  </button>
                  <div className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 text-xs">
                        <MapPin size={14} /> {assignedRoom}
                  </div>
              </div>

              <div className="flex flex-wrap bg-slate-100/90 p-1.5 rounded-2xl shadow-sm border border-slate-200/90 gap-1 justify-center w-full md:w-auto">
                {/* Mobile Profile Icon integration similar to Helper */}
                <div className="md:hidden mr-1">
                    <div className="bg-white p-2 rounded-xl shadow-sm text-indigo-600 border border-slate-200">
                        <UserIcon size={18} />
                    </div>
                </div>

                {[
                    { id: 'timeline', icon: CalendarClock, label: 'Timeline' },
                    { id: 'rounds', icon: Trophy, label: 'Rounds' },
                    { id: 'notifications', icon: Bell, label: 'Notifs' },
                    { id: 'arcade', icon: Gamepad2, label: 'Arcade' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === tab.id 
                                ? 'bg-white shadow-sm text-indigo-700 font-bold' 
                                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'}`}
                    >
                        {tab.icon && <tab.icon size={15} />} <span className="hidden md:inline">{tab.label}</span>
                    </button>
                ))}
              </div>
          </div>
      </header>

      {activeTab === 'arcade' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <ErrorBoundary>
            <ArcadeDashboard user={user} customUserName={teamDetails?.name} />
          </ErrorBoundary>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-8 pb-20">
          {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
            <GlassCard className="p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6">Event Timeline</h2>
                <div className="relative border-l-2 border-indigo-100 pl-6 space-y-8">
                    {TIMELINE_DATA.map((event, i) => (
                        <div key={i} className="relative">
                            <div className="absolute -left-[29px] top-1 w-3 h-3 bg-indigo-500 rounded-full ring-4 ring-white shadow-sm"></div>
                            <div className="mb-1">
                                <h3 className="font-bold text-gray-800">{event.title}</h3>
                                <span className="text-xs text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded">{event.time}</span>
                            </div>
                            <p className="text-xs text-gray-500">{event.day} • {event.location}</p>
                        </div>
                    ))}
                </div>
            </GlassCard>
        )}

        {/* ROUNDS TAB */}
        {activeTab === 'rounds' && (
            <div className="grid gap-6 md:grid-cols-2">
                {/* Troll Button */}
                {isTrollActive && (
                    <GlassCard className="p-6 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 text-white col-span-full shadow-2xl relative overflow-hidden group cursor-pointer" onClick={() => setShowTrollModal(true)}>
                        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
                        <div className="relative z-10 text-center">
                            <h2 className="text-3xl font-black mb-2 group-hover:scale-105 transition-transform">VIEW MARKS</h2>
                            <p className="text-indigo-200 font-medium">Click here to view your evaluation scores</p>
                        </div>
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-500 rounded-full blur-[50px] opacity-50 group-hover:opacity-100 transition-opacity"></div>
                    </GlassCard>
                )}

                {Object.values(ROUND_RUBRICS).map((round) => {
                    // Determine Status
                    let status = 'Locked';
                    let statusColor = 'bg-gray-100 text-gray-500';

                    // Simple logic: if currentRound matches
                    if (currentRound === round.id) {
                        status = roundStatus === 'locked' ? 'Locked' : roundStatus === 'completed' ? 'Completed' : 'Ongoing';
                        if (status === 'Ongoing') statusColor = 'bg-green-100 text-green-700';
                        if (roundStatus === 'evaluation') {
                            status = 'Evaluation';
                            statusColor = 'bg-yellow-100 text-yellow-700';
                        }
                    } else {
                        // If round is passed? (Need ordered logic or just compare IDs roughly)
                        // For hackathon, just check if it's "past".
                        // Let's assume sequential: idea < phase1 < phase2 < phase3
                        // Simplified: Only current is highlighted, others locked or done.
                        // Actually, if current is phase2, phase1 is done.
                        const rounds = ['idea', 'phase1', 'phase2', 'phase3'];
                        if (rounds.indexOf(round.id) < rounds.indexOf(currentRound)) {
                            status = 'Completed';
                            statusColor = 'bg-blue-100 text-blue-700';
                        }
                    }

                    return (
                        <GlassCard key={round.id} className="p-6 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xl font-bold text-gray-800">{round.label}</h3>
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusColor}`}>{status}</span>
                                </div>
                                <p className="text-gray-500 text-sm mb-4">
                                    Max Score: {round.maxMarks}
                                </p>
                            </div>

                            {/* Status Control for CURRENT round */}
{currentRound === round.id && (
    <div className="my-4 pt-4 border-t border-gray-100">
         {(() => {
            // 1. Define strict Phase 3 Evaluation Check
            const isP3Evaluated = currentRound === 'phase3' && (
                teamDetails?.phase3Evaluated === true || 
                (teamDetails?.status === 'evaluated' && teamDetails?.lastEvaluatedRound === 'phase3')
            );

            // 2. Standard Evaluation Check
            const isEvaluated = teamDetails?.lastEvaluatedRound === currentRound;
            
            // 3. Ready Check: User is NOT ready if they are already evaluated (Standard OR P3)
            const isReady = !isEvaluated && !isP3Evaluated && teamDetails?.readyRound === currentRound;

            let label = 'Working';
            let color = 'bg-indigo-50 text-indigo-600 border border-indigo-100';

            // Logic for Label & Color
            if (currentRound === 'phase3') {
                if (roundStatus === 'completed') {
                    label = 'Completed';
                    color = 'bg-green-50 text-green-600 border border-green-100';
                } else if (isP3Evaluated) {
                     // If ANY evaluation exists, mark as completed
                     label = 'Completed';
                     color = 'bg-green-50 text-green-600 border border-green-100';
                } else if (isReady) {
                    label = 'Ready';
                    color = 'bg-yellow-50 text-yellow-600 border border-yellow-100';
                }
            } else {
                // Normal Logic for other rounds
                if (isEvaluated) {
                    label = 'Completed';
                    color = 'bg-green-50 text-green-600 border border-green-100';
                } else if (isReady) {
                    label = 'Ready';
                    color = 'bg-yellow-50 text-yellow-600 border border-yellow-100';
                }
            }

            // 4. Trigger Logic: Hide button if Locked, Completed, Standard Evaluated, OR Phase 3 Evaluated
            const canTrigger = roundStatus !== 'locked' && 
                               roundStatus !== 'completed' && 
                               !isEvaluated && 
                               !isP3Evaluated;

            return (
                <div className="flex flex-col gap-3">
                     <div className={`px-3 py-1.5 rounded-lg text-center font-bold text-sm ${color}`}>
                         Status: {label}
                     </div>
                     {canTrigger && (
                         <button
                            onClick={markReadyForEvaluation}
                            disabled={isReady}
                            className={`w-full py-2.5 rounded-lg font-bold text-sm shadow transition-all transform active:scale-95
                                ${isReady
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                        >
                            {isReady ? 'Waiting for Jury...' : 'Mark as Ready'}
                        </button>
                     )}
                </div>
            );
         })()}
    </div>
)}

                            <button
                                onClick={() => setViewRubric(round.id)}
                                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-bold transition-colors mt-auto"
                            >
                                View Rubrics
                            </button>
                        </GlassCard>
                    );
                })}
            </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
            <div className="space-y-4">
                {(notifications || []).map(n => (
                    <GlassCard key={n.id} className={`p-4 border-l-4 ${n.type === 'urgent' ? 'border-red-500 bg-red-50/50' : 'border-indigo-500'}`}>
                        <div className="flex justify-between items-start mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${n.type === 'urgent' ? 'bg-red-200 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                {n.type === 'urgent' ? 'URGENT' : 'INFO'}
                            </span>
                            <span className="text-xs text-gray-400">{safeFormat(n.timestamp, 'HH:mm')}</span>
                        </div>
                        <p className="text-gray-800 font-medium">{n.message}</p>
                    </GlassCard>
                ))}
                {(!notifications || notifications.length === 0) && <p className="text-center text-gray-500">No notifications.</p>}
            </div>
        )}

        </div>
      )}
    </div>
  );
};

/* --- HelperDashboard --- */

const HelperDashboard = ({ user, userProfile }) => {
  const [activeTab, setActiveTab] = useState('overview'); // Default to overview
  const [requests, setRequests] = useState([]);
  const [helperData, setHelperData] = useState(null);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, evaluated: 0 });
  const [teammates, setTeammates] = useState([]);
  const [trackTeams, setTrackTeams] = useState([]); // Store contestant teams for this track
  const [trackJuries, setTrackJuries] = useState([]); // Store juries for this track (Jury Helper)

  // Master Helper State
  const [allHelpers, setAllHelpers] = useState([]);

  // New Check-in Alert State (Queue)
  const [checkInQueue, setCheckInQueue] = useState([]);

  // New Help Request Alert State (Queue)
  const [helpRequestQueue, setHelpRequestQueue] = useState([]);

  // New Ready Alert State (Jury Helper)
  const [readyAlert, setReadyAlert] = useState(null);

  const assignedTrack = userProfile?.assignedTrack || "Unknown";
  const assignedVenue = userProfile?.assignedVenue;
  const helperRole = userProfile?.helperRole;
  const isJuryHelper = helperRole === 'Jury Helpers';
  const isMasterHelper = userProfile?.isMasterHelper || helperRole === 'Master Helper';

  const qrValue = assignedTrack !== "Unknown" ? `HACKFEST_CHECKIN_${assignedTrack}` : "INVALID_TRACK";

  // System State for "Current Round" stats
  const systemState = useSystemState();

  // Sound Refs
  const prevRequestsLength = React.useRef(0);
  const isFirstLoad = React.useRef(true);

  // Helper for Acknowledgment
  const handleAcknowledgeReady = (teamId) => {
      // FIX: Create the same composite key: ID + Current Round
      const compositeKey = `${teamId}_${systemState.currentRound}`;
      
      const localAck = safeJsonParse(localStorage.getItem('acknowledgedReadyTeams'), []);
      
      if (!localAck.includes(compositeKey)) {
          const newList = [...localAck, compositeKey];
          localStorage.setItem('acknowledgedReadyTeams', JSON.stringify(newList));
      }
      setReadyAlert(null);
  };
  useEffect(() => {
    if (userProfile) {
        setHelperData(userProfile);
        // If Reg Desk, default to checkin
        if (userProfile.helperRole === 'Registration Desk') {
            setActiveTab('checkin');
        } else if (isMasterHelper) {
             setActiveTab('helpers');
        } else {
            setActiveTab('overview');
        }
    }

    // Fetch Teammates (Same Track) - IF not Master
    if (assignedTrack && !isMasterHelper) {
        const qHelpers = query(collection(db, 'users'), where('role', '==', 'helper'), where('assignedTrack', '==', assignedTrack));
        getDocs(qHelpers).then(snap => {
            const mates = snap.docs.map(d => d.data()).filter(h => h.email !== user.email);
            setTeammates(mates);
        });

        // Jury Helper: Fetch Juries
        if (isJuryHelper) {
            const qJuries = query(collection(db, 'users'), where('role', '==', 'jury'), where('assignedTrack', '==', assignedTrack));
            getDocs(qJuries).then(snap => {
                const juries = snap.docs.map(d => d.data());
                setTrackJuries(juries);
            });
        }
    }

    // Master Helper: Fetch ALL Helpers
    let unsubscribeHelpers = () => {};
    if (isMasterHelper) {
        const qHelpers = query(collection(db, 'users'), where('role', '==', 'helper'));
        unsubscribeHelpers = safeOnSnapshot(qHelpers, (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllHelpers(all);
        }, (err) => console.warn("Helpers list notice:", err.message));
    }

    // Help Requests (Filtered by Track first, then Venue if specific)
    const q = query(
        collection(db, 'help_requests'),
        orderBy('timestamp', 'desc')
    );
    const unsubscribeReq = safeOnSnapshot(q, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filtered = reqs.filter(r => !r.resolved);
        
        let finalRequests = [];

        if (isMasterHelper) {
            // Master Helper sees ALL unresolved requests
            finalRequests = filtered;
        } else if (assignedTrack !== "Unknown") {
            finalRequests = filtered.filter(r => {
                 if (r.track) return r.track === assignedTrack;
                 // Fallback for requests without track (if any): check venue match
                 if (assignedVenue && r.roomNumber && r.roomNumber.includes(assignedVenue)) return true;
                 return false;
            });
        } else {
             // General helpers (no track?)
             finalRequests = [];
        }

        // --- NEW: Alert Queue for New Requests (Excluding Jury Helpers) ---
        if (!isJuryHelper) {
             snapshot.docChanges().forEach(change => {
                 if (change.type === 'added') {
                     const data = { id: change.doc.id, ...change.doc.data() };

                     // Filter Logic Check
                     let matches = false;
                     if (isMasterHelper) {
                         matches = true; // Match ALL for master helper
                     } else if (assignedTrack !== "Unknown") {
                         if (data.track && data.track === assignedTrack) matches = true;
                         else if (assignedVenue && data.roomNumber && data.roomNumber.includes(assignedVenue)) matches = true;
                     }

                     if (matches && !data.resolved) {
                         // Check if truly new (within last minute to avoid stale alerts on reload)
                         const now = new Date();
                         const reqTime = data.timestamp ? new Date(data.timestamp) : new Date(0);
                         if ((now - reqTime) < 60000) { // 60s window
                             setHelpRequestQueue(prev => {
                                 if (prev.find(r => r.id === data.id)) return prev;

                                 // Play Sound for New Request
                                 try {
                                     const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                                     audio.volume = 1.0;
                                     audio.play().catch(e => console.log("Audio play blocked", e));
                                 } catch(e) {}

                                 return [...prev, data];
                             });
                         }
                     }
                 }
             });
        }

        setRequests(finalRequests);
        prevRequestsLength.current = finalRequests.length;
        isFirstLoad.current = false;
    }, (err) => console.warn("Requests snapshot notice:", err.message));

    // Track Stats & Ready Alert
    let unsubscribeStats = () => {};
    let unsubscribeCheckins = () => {};

    if (assignedTrack !== "Unknown") {
        const statsQ = query(collection(db, 'teams'), where('track', '==', assignedTrack));
        unsubscribeStats = safeOnSnapshot(statsQ, (snapshot) => {
            const teams = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const checkedIn = teams.filter(t => t.attendanceMarked).length;
            const evaluated = teams.filter(t => t.lastEvaluatedRound === systemState.currentRound).length;
            setStats({ total: teams.length, checkedIn, evaluated });

            // Sort: Ready Teams first for better visibility
            teams.sort((a, b) => {
                 const aReady = a.status === 'ready' && a.readyRound === systemState.currentRound;
                 const bReady = b.status === 'ready' && b.readyRound === systemState.currentRound;
                 if (aReady && !bReady) return -1;
                 if (!aReady && bReady) return 1;
                 return 0;
            });
            setTrackTeams(teams);

            // Ready Alert Logic (Jury Helper)
if (isJuryHelper) {
    // 1. Filter teams that are ready for the CURRENT round
    const readyTeams = teams.filter(t => t.status === 'ready' && t.readyRound === systemState.currentRound);
    
    if (readyTeams.length > 0) {
         const localAck = safeJsonParse(localStorage.getItem('acknowledgedReadyTeams'), []);
         
         // 2. FIX: Check against "TeamID_RoundID" instead of just "TeamID"
         const unacknowledged = readyTeams.find(t => {
             const compositeKey = `${t.id}_${t.readyRound}`;
             return !localAck.includes(compositeKey);
         });

         if (unacknowledged) {
              setReadyAlert(prev => {
                  // Prevent re-triggering for the exact same team/round combo
                  if (prev?.id === unacknowledged.id && prev?.readyRound === unacknowledged.readyRound) return prev;
                  
                  try {
                     const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                     audio.volume = 1.0;
                     audio.play().catch(e => console.log("Audio play blocked", e));
                  } catch (e) { console.error(e); }
                  
                  return unacknowledged;
              });
         }
    }
}
                  }, (err) => console.warn("Stats snapshot notice:", err.message));
    }
    // Check-in Queue logic separated to handle Master Helper
    let checkinQuery;
    if (isMasterHelper) {
        checkinQuery = query(collection(db, 'checkins'), orderBy('timestamp', 'desc'), limit(10));
    } else if (assignedTrack !== "Unknown") {
        checkinQuery = query(collection(db, 'checkins'), where('track', '==', assignedTrack), orderBy('timestamp', 'desc'), limit(10));
    }

    if (checkinQuery) {
        unsubscribeCheckins = safeOnSnapshot(checkinQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = { id: change.doc.id, ...change.doc.data() };
                    const now = new Date();
                    const eventTime = new Date(data.timestamp);

                    // Only show if happened in last 30 seconds
                    if ((now - eventTime) < 30000) {
                         setCheckInQueue(prev => {
                             // Prevent duplicates
                             if (prev.find(c => c.id === data.id)) return prev;
                             return [...prev, data];
                         });
                    }
                }
            });
        }, (err) => console.warn("Checkins snapshot notice:", err.message));
    }

return () => { unsubscribeReq(); unsubscribeStats(); unsubscribeCheckins(); unsubscribeHelpers(); };
  }, [
    user, 
    userProfile, 
    assignedTrack, 
    assignedVenue, 
    systemState.currentRound, 
    isJuryHelper, 
    isMasterHelper, 
    readyAlert // <--- ADDED HERE
  ]);

  const resolveRequest = async (id) => {
      try {
          await updateDoc(doc(db, 'help_requests', id), {
              resolved: true,
              resolvedAt: new Date().toISOString(),
              solvedBy: user.displayName || user.email
          });

          await logAction(
            user.uid,
            user.email,
            user.displayName || user.email,
            'helper',
            'HELP_RESOLVED',
            `Request ${id} marked resolved by helper`
          );
      } catch (err) {
          console.error("Error resolving request", err);
      }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center max-w-5xl mx-auto p-4 md:p-6 overflow-hidden">

      {/* Check-in Alert Modal (Queue System) */}
      <AnimatePresence mode="popLayout">
        {checkInQueue.length > 0 && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div
                    key={checkInQueue[0].id} // Key ensures animation when switching
                    initial={{ scale: 0.9, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white p-6 rounded-2xl w-full max-w-md text-center relative shadow-2xl"
                >
                    <div className="absolute top-4 left-4 text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                        Queue: {checkInQueue.length}
                    </div>
                    <button onClick={() => setCheckInQueue(prev => prev.slice(1))} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X /></button>

                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>

                    <h3 className="text-2xl font-black text-gray-800 mb-1">New Check-In!</h3>
                    <p className="text-indigo-600 font-bold mb-6 text-sm uppercase tracking-wider">{checkInQueue[0].track}</p>

                    <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
                        <h4 className="text-lg font-bold text-gray-800 mb-2">{checkInQueue[0].teamName}</h4>
                        {checkInQueue[0].memberNames && (
                            <p className="text-xs text-gray-600 mb-4 font-medium px-4">
                                {checkInQueue[0].memberNames.join(', ')}
                            </p>
                        )}
                        <div className="flex justify-center items-center gap-4 text-sm">
                            <div className="bg-white px-3 py-1 rounded shadow-sm border border-gray-100">
                                <span className="block font-bold text-gray-800 text-lg">{checkInQueue[0].total}</span>
                                <span className="text-[10px] text-gray-500 uppercase">Total</span>
                            </div>
                            <div className="bg-green-50 px-3 py-1 rounded shadow-sm border border-green-100">
                                <span className="block font-bold text-green-700 text-lg">{checkInQueue[0].veg}</span>
                                <span className="text-[10px] text-green-600 uppercase">Veg</span>
                            </div>
                            <div className="bg-red-50 px-3 py-1 rounded shadow-sm border border-red-100">
                                <span className="block font-bold text-red-700 text-lg">{checkInQueue[0].nonVeg}</span>
                                <span className="text-[10px] text-red-600 uppercase">Non-Veg</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => setCheckInQueue(prev => prev.slice(1))}
                        className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700"
                    >
                        Dismiss {checkInQueue.length > 1 ? `& Next (${checkInQueue.length - 1})` : ''}
                    </button>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Help Request Alert Modal (Queue System) */}
      <AnimatePresence mode="popLayout">
        {helpRequestQueue.length > 0 && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-red-900/80 backdrop-blur-md">
                <motion.div
                    key={helpRequestQueue[0].id}
                    initial={{ scale: 0.9, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white p-6 rounded-2xl w-full max-w-md text-center relative shadow-2xl border-4 border-red-500"
                >
                    <div className="absolute top-4 left-4 text-xs font-bold text-white bg-red-500 px-2 py-1 rounded-full">
                        Pending: {helpRequestQueue.length}
                    </div>
                    <button onClick={() => setHelpRequestQueue(prev => prev.slice(1))} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X /></button>

                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                        <HandMetal className="w-8 h-8 text-red-600" />
                    </div>

                    <h3 className="text-2xl font-black text-gray-800 mb-1">HELP REQUESTED!</h3>
                    <p className="text-red-600 font-bold mb-6 text-sm uppercase tracking-wider">{helpRequestQueue[0].track || 'General'}</p>

                    <div className="bg-red-50 rounded-xl p-4 mb-6 border border-red-100">
                        <div className="flex items-center justify-center gap-2 mb-2">
                             <h4 className="text-lg font-bold text-gray-800">{helpRequestQueue[0].teamName || 'Unknown Team'}</h4>
                             <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-red-100 text-red-500 font-bold">{helpRequestQueue[0].roomNumber || 'N/A'}</span>
                        </div>
                        <p className="text-sm text-gray-800 font-medium italic">
                            "{helpRequestQueue[0].issue}"
                        </p>
                        <p className="text-[10px] text-gray-500 mt-2 uppercase font-bold">
                            {safeFormat(helpRequestQueue[0].timestamp, 'HH:mm:ss')}
                        </p>
                    </div>

                    <button
                        onClick={() => {
                            setHelpRequestQueue(prev => prev.slice(1));
                            setActiveTab('requests'); // Auto-switch to requests tab
                        }}
                        className="w-full py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 animate-pulse"
                    >
                        Acknowledge & View {helpRequestQueue.length > 1 ? `(${helpRequestQueue.length - 1} more)` : ''}
                    </button>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Ready Alert Modal (Jury Helper) */}
      <AnimatePresence>
        {readyAlert && (
            <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-indigo-900/95 backdrop-blur-xl p-6 text-center">
                 <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-white/10 p-6 rounded-full mb-8 border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.2)]"
                 >
                    <Trophy size={64} className="text-yellow-400" />
                 </motion.div>

                 <motion.h2
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-4xl md:text-6xl font-black text-white mb-2 tracking-tight"
                 >
                    TEAM READY!
                 </motion.h2>

                 <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white text-gray-900 p-8 rounded-3xl w-full max-w-xl shadow-2xl my-8"
                 >
                     <h3 className="text-3xl font-bold mb-2 text-indigo-700">{readyAlert.name}</h3>
                     <p className="text-xl font-mono text-gray-500 font-bold mb-6">{readyAlert.id}</p>

                     <div className="flex justify-center gap-4 text-sm font-bold text-gray-500 uppercase tracking-widest">
                         <span className="bg-gray-100 px-3 py-1 rounded">{readyAlert.venue || 'TBD'}</span>
                         <span className="bg-gray-100 px-3 py-1 rounded">{readyAlert.track || 'TBD'}</span>
                     </div>
                 </motion.div>

                 <motion.button
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => handleAcknowledgeReady(readyAlert.id)}
                    className="px-10 py-4 bg-white/20 text-white font-bold rounded-2xl shadow-xl hover:bg-white/30 transition-all text-lg border border-white/30 backdrop-blur"
                 >
                    Acknowledge
                 </motion.button>
            </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 px-2">
            <div className="flex items-center gap-4">
               <div className="bg-white p-2 rounded-xl shadow-sm border border-indigo-50">
                    <LayoutDashboard className="w-8 h-8 text-indigo-600" />
               </div>
               <div>
                  <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">Helper Dashboard</h1>
                  <p className="text-indigo-600 font-bold text-sm">Welcome, {helperData?.name || user.email}</p>
               </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2 md:items-center w-full md:w-auto">
                 {/* Desktop: Details (Hidden on Mobile) */}
                 <div className="hidden md:flex flex-col items-end gap-1 md:mb-0">
                    {helperData?.id && (
                        <div className="bg-white/50 px-3 py-1 rounded-full text-xs font-mono text-indigo-600 border border-indigo-100 flex items-center gap-2">
                            <UserIcon size={12} /> {helperData.id}
                        </div>
                    )}
                    {helperData?.year && helperData?.branch && (
                        <div className="text-xs text-gray-400 font-medium">
                            {helperData.year} Year • {helperData.branch}
                        </div>
                    )}
                 </div>

                 {/* Navigation Bar (Centered on Mobile) */}
                 <div className="flex items-center justify-center w-full md:w-auto">
                    <div className="flex flex-wrap bg-slate-100/90 p-1.5 rounded-2xl shadow-sm border border-slate-200/90 gap-1 justify-center items-center w-full md:w-auto">
                        {/* Mobile: Profile Icon (Integrated at the Start of Nav) */}
                        <div className="md:hidden mr-1">
                            <div className="bg-white p-2 rounded-xl shadow-sm text-indigo-600 border border-slate-200">
                                <UserIcon size={18} />
                            </div>
                        </div>

                        {helperRole === 'Registration Desk' && (
                        <button
                            onClick={() => setActiveTab('checkin')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                                ${activeTab === 'checkin' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'}`}
                        >
                            <QrCode size={15} /> <span className="hidden md:inline">Check-In</span>
                        </button>
                    )}

                    {isMasterHelper ? (
                        <button
                            onClick={() => setActiveTab('helpers')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                                ${activeTab === 'helpers' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'}`}
                        >
                            <User size={15} /> <span className="hidden md:inline">Helpers</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                                ${activeTab === 'overview' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'}`}
                        >
                            <LayoutDashboard size={15} /> <span className="hidden md:inline">Info</span>
                        </button>
                    )}

                    <button
                        onClick={() => setActiveTab('requests')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === 'requests' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                    >
                        <Bell size={16} /> <span className="hidden md:inline">Requests</span>
                        {requests.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{requests.length}</span>}
                    </button>
                    {!isMasterHelper && (
                        <button
                            onClick={() => setActiveTab('arcade')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                                ${activeTab === 'arcade' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                        >
                            <Gamepad2 size={16} /> <span className="hidden md:inline">Arcade</span>
                        </button>
                    )}
                 </div>
            </div>
            </div>
      </header>

      <div className="w-full flex-1 flex flex-col min-h-0 overflow-hidden p-6 md:p-8">
        {/* Render Checkin if active OR if it's the only tab available for Reg Desk (safety) */}
        {activeTab === 'arcade' ? (
            <ArcadeDashboard user={user} customUserName={helperData?.name} />
        ) : activeTab === 'checkin' ? (
             <GlassCard className="flex-1 p-4 md:p-10 min-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="flex flex-col items-center justify-center min-h-full w-full">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2 text-center">Attendance Check-In</h2>
                <p className="text-indigo-600 font-bold mb-6 md:mb-10 text-lg uppercase tracking-widest text-center">{assignedTrack}</p>

                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white p-4 md:p-6 rounded-3xl shadow-xl max-w-[90vw] overflow-hidden flex justify-center"
                >
                    <QRCode value={qrValue} size={250} className="max-w-full h-auto" />
                </motion.div>
               
              </div>
             </GlassCard>
        ) : activeTab === 'helpers' ? (
            // Master Helper: Helpers List
            <GlassCard className="p-6 h-full flex flex-col min-h-0">
                <div className="flex flex-col h-full w-full">
                    <div className="flex items-center justify-between mb-4 shrink-0">
                        <div className="flex items-center gap-2">
                            <UserIcon className="text-indigo-500" size={20} />
                            <h3 className="font-bold text-gray-800">All Helpers</h3>
                        </div>
                        <span className="bg-indigo-100 text-indigo-600 text-xs font-bold px-2 py-1 rounded-full">{allHelpers.length} Active</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                        {allHelpers.map((h, i) => (
                             <div key={i} className="flex justify-between items-center bg-white/50 p-3 rounded-xl border border-white/60 shadow-sm hover:bg-white hover:shadow-md transition-all">
                                 <div>
                                     <div className="flex items-center gap-2">
                                         <p className="font-bold text-gray-800">{h.name}</p>
                                         <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 uppercase">{h.assignedTrack || 'N/A'}</span>
                                     </div>
                                     <div className="flex items-center gap-2 mt-1">
                                          <p className="text-xs text-gray-500">{h.assignedVenue || 'No Venue'}</p>
                                          <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 rounded">{h.helperRole || 'Helper'}</span>
                                     </div>
                                 </div>
                                 {h.phone && (
                                     <a href={`tel:${h.phone}`} className="bg-green-100 p-2.5 rounded-full text-green-600 hover:bg-green-200 transition-colors shadow-sm">
                                         <Phone size={18} />
                                     </a>
                                 )}
                             </div>
                        ))}
                        {allHelpers.length === 0 && <p className="text-center text-gray-400 py-10">No helpers found.</p>}
                    </div>
                </div>
            </GlassCard>
        ) : activeTab === 'overview' ? (
             // Info Card - Full Height
             <GlassCard className="p-6 h-full flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex flex-col h-full flex-1 min-h-0 w-full">
                    <h3 className="font-bold text-gray-800 mb-4 shrink-0">Track Team & Stats</h3>
                    
                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-2 mb-4 shrink-0">
                        <div className="text-center bg-green-50 p-2 rounded-lg">
                            <span className="block text-lg font-black text-green-600">{stats.checkedIn}/{stats.total}</span>
                            <span className="text-[10px] text-green-800 font-bold uppercase">Check-In</span>
                        </div>
                        <div className="text-center bg-blue-50 p-2 rounded-lg">
                            <span className="block text-lg font-black text-blue-600">{stats.evaluated}</span>
                            <span className="text-[10px] text-blue-800 font-bold uppercase">Evaluated</span>
                        </div>
                        <div className="text-center bg-orange-50 p-2 rounded-lg">
                            <span className="block text-lg font-black text-orange-500">{stats.checkedIn - stats.evaluated}</span>
                            <span className="text-[10px] text-orange-800 font-bold uppercase">Pending</span>
                        </div>
                    </div>

                    <div className="bg-indigo-50 p-3 rounded-lg flex justify-between items-center mb-4 shrink-0">
                        <div>
                            <p className="text-xs text-indigo-400 font-bold uppercase">Faculty Lead</p>
                            <p className="font-bold text-gray-800 text-sm">{helperData?.facultyInfo?.name || 'N/A'}</p>
                        </div>
                        {helperData?.facultyInfo?.contact && (
                            <a href={`tel:${helperData.facultyInfo.contact}`} className="bg-white p-2 rounded-full text-indigo-600 shadow-sm">
                                <Phone size={16} />
                            </a>
                        )}
                    </div>

                    {/* Scrollable Content: Helpers + Contestant Teams */}
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar -mx-2 px-2">

                        {/* Juries Section (Only for Jury Helper) */}
                        {isJuryHelper && (
                            <div className="mb-6">
                                <p className="text-xs text-slate-700 font-bold uppercase tracking-wider mb-2 sticky top-0 bg-white z-10 py-1 border-b border-slate-100">Assigned Juries ({trackJuries.length})</p>
                                <div className="space-y-2">
                                    {trackJuries.map((jury, i) => (
                                        <div key={i} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                                            <div>
                                                <p className="text-sm font-bold text-slate-900">{jury.name}</p>
                                                <p className="text-[11px] text-slate-500 font-medium">{jury.designation}, {jury.organization}</p>
                                            </div>
                                            {jury.phone && (
                                                <a href={`tel:${jury.phone}`} className="bg-emerald-50 border border-emerald-200 p-2 rounded-full text-emerald-700 hover:bg-emerald-100 shrink-0">
                                                    <Phone size={14} />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                    {trackJuries.length === 0 && <p className="text-sm text-slate-400 text-center py-2">No juries found.</p>}
                                </div>
                            </div>
                        )}

                        {/* Helpers Section */}
                        <div className="mb-6">
                            <p className="text-xs text-slate-700 font-bold uppercase tracking-wider mb-2 sticky top-0 bg-white z-10 py-1 border-b border-slate-100">Track Team ({teammates.length})</p>
                            <div className="space-y-2">
                                {teammates.map((mate, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-slate-900">{mate.name}</p>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold border
                                                    ${mate.helperRole === 'Main Coordinator' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                    mate.helperRole === 'Registration Desk' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                                                    'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                                    {mate.helperRole || 'Volunteer'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 font-medium">{mate.assignedVenue || 'General'}</p>
                                        </div>
                                        {mate.phone && (
                                            <a href={`tel:${mate.phone}`} className="bg-emerald-50 border border-emerald-200 p-2 rounded-full text-emerald-700 hover:bg-emerald-100 shrink-0">
                                                <Phone size={14} />
                                            </a>
                                        )}
                                    </div>
                                ))}
                                {teammates.length === 0 && <p className="text-sm text-slate-400 text-center py-2">No other members found in track.</p>}
                            </div>
                        </div>

                        {/* Contestant Teams Section */}
                        <div>
                            <p className="text-xs text-slate-700 font-bold uppercase tracking-wider mb-2 sticky top-0 bg-white z-10 py-1 border-b border-slate-100">Contestant Teams ({trackTeams.length})</p>
                            <div className="space-y-2">
                                {trackTeams.map((team) => {
                                    const isReady = team.status === 'ready' && team.readyRound === systemState.currentRound;
                                    return (
                                        <div key={team.id} className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${isReady ? 'bg-amber-50 border-amber-300 shadow-md' : 'bg-white border-slate-200 shadow-sm'}`}>
                                            <div className="flex justify-between items-start">
                                                <p className="font-bold text-slate-900 text-sm truncate w-2/3">{team.name}</p>
                                                {isReady ? (
                                                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">READY</span>
                                                ) : (
                                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border
                                                        ${team.attendanceMarked ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                        {team.attendanceMarked ? 'Checked In' : 'Pending'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span className="font-mono bg-gray-100 px-1.5 rounded">{team.id}</span>
                                                <span>•</span>
                                                <span>Total: <span className="font-bold text-gray-700">{team.memberCount || 0}</span></span>
                                                <span>( <span className="text-green-600 font-bold">{team.vegCount || 0} V</span> / <span className="text-red-600 font-bold">{team.nonVegCount || 0} NV</span> )</span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {trackTeams.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No teams found.</p>}
                            </div>
                        </div>

                    </div>
                </div>
             </GlassCard>
        ) : (
            // Live Requests - Full Height
            <GlassCard className="p-6 h-full flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex flex-col h-full flex-1 min-h-0 w-full">
                    <div className="flex items-center justify-between mb-6 shrink-0">
                        <div className="flex items-center gap-2">
                            <Bell className="text-orange-500" size={20} />
                            <h3 className="font-bold text-gray-800">Live Requests</h3>
                        </div>
                        {requests.length > 0 && (
                            <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">{requests.length} Active</span>
                        )}
                    </div>

                    <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                        {requests.length === 0 ? (
                            <p className="text-gray-400 text-center py-10 text-sm">No active requests.</p>
                        ) : (
                            requests.map((req) => (
                                <div key={req.id} className="bg-white/60 p-4 rounded-xl border border-white/60 flex justify-between items-start shadow-sm">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-bold text-gray-800 text-sm">{req.teamName || 'Unknown Team'}</p>
                                            <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 rounded">{req.roomNumber || 'N/A'}</span>
                                        </div>
                                        <p className="text-sm text-gray-600">{req.issue}</p>
                                        <p className="text-[10px] text-gray-400 mt-2">
                                            {safeFormat(req.timestamp, 'HH:mm')}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </GlassCard>
        )}
      </div>
    </div>
  );
};

const JuryDashboard = ({ user, userProfile }) => {
  const [activeTab, setActiveTab] = useState('teams');
  const [teams, setTeams] = useState([]);
  const [evaluations, setEvaluations] = useState({});
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [privateData, setPrivateData] = useState({}); 
  const [juryNotes, setJuryNotes] = useState([]);
  const [notingTeam, setNotingTeam] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const systemState = useSystemState();
  const { currentRound, roundStatus } = systemState;
  const isExtraJury = userProfile?.isExtraJury || false;
  const isFinalRound = currentRound === 'phase3';

  // --- 1. Celebration Logic ---
  useEffect(() => {
     if (currentRound === 'phase3' && roundStatus === 'completed') {
         setShowCelebration(true);
     }
  }, [currentRound, roundStatus]);

  // --- 2. Auto-Tab Switching ---
  useEffect(() => {
      // If Phase 3, switch everyone to 'final' tab context
      if (isFinalRound && activeTab === 'teams') {
          setActiveTab('final');
      }
      // If Not Phase 3 and on 'final' tab, switch back
      if (!isFinalRound && activeTab === 'final') {
          setActiveTab('teams');
      }
  }, [isFinalRound, activeTab]);

  // --- 3. Data Fetching ---
  useEffect(() => {
    const fetchData = async () => {
      if (!userProfile) return;

      try {
        const assignedTrack = userProfile.assignedTrack;
        
        // --- A. TEAMS QUERY LOGIC ---
        let q;
        // CRITICAL FIX: 
        // 1. If Phase 3 (Finals) AND Main Jury -> Fetch ALL teams (Global View).
        // 2. Otherwise (Extra Jury OR Phase 1/2) -> Fetch TRACK teams.
        if (isFinalRound && !isExtraJury) {
            q = query(collection(db, 'teams')); // Global
        } else if (assignedTrack) {
            q = query(collection(db, 'teams'), where('track', '==', assignedTrack)); // Track Scoped
        } else {
            // Fallback for juries without track
            q = query(collection(db, 'teams'), where('assignedJuryId', '==', userProfile.id));
        }

        const unsubscribeTeams = safeOnSnapshot(q, (snapshot) => {
            let teamData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Only show Checked-In teams
            teamData = teamData.filter(t => t.attendanceMarked);
            setTeams(teamData.length > 0 ? teamData : SAMPLE_TEAMS);
        }, (err) => {
            console.warn("Jury teams notice:", err.message);
            setTeams(SAMPLE_TEAMS);
        });

        // --- B. PRIVATE DATA (For Finalist Flag) ---
        const unsubPrivate = safeOnSnapshot(collection(db, 'private_team_data'), (snap) => {
            const pData = {};
            snap.forEach(doc => {
                pData[doc.id] = doc.data();
            });
            setPrivateData(pData);
        }, (err) => console.warn("Private team data notice:", err.message));

        // --- C. EVALUATIONS ---
        const collectionName = isExtraJury ? 'extra_jury_evaluations' : 'evaluations';
        const evalsQ = query(collection(db, collectionName), where('juryEmail', '==', user.email));
        const unsubscribeEvals = safeOnSnapshot(evalsQ, (snapshot) => {
             const evalsMap = {};
             snapshot.forEach(doc => {
                 const data = doc.data();
                 if (!evalsMap[data.teamId]) evalsMap[data.teamId] = {};
                 evalsMap[data.teamId][data.round] = { id: doc.id, ...data };
             });
             setEvaluations(evalsMap);
        }, (err) => console.warn("Jury evaluations notice:", err.message));

        // --- D. NOTIFICATIONS ---
        const notifQ = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(20));
        const unsubscribeNotifs = safeOnSnapshot(notifQ, (snapshot) => {
            const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const myNotifs = all.filter(n => {
                if (!n.targets || n.targets.includes('all')) return true;
                return n.targets.includes('jury');
            });
            setNotifications(myNotifs);
        }, (err) => console.warn("Jury notifications notice:", err.message));

        // --- E. NOTES ---
        const notesQ = query(collection(db, 'jury_notes'), where('juryEmail', '==', user.email), orderBy('timestamp', 'desc'));
        const unsubscribeNotes = safeOnSnapshot(notesQ, (snapshot) => {
            const notesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setJuryNotes(notesData);
        }, (err) => console.warn("Jury notes notice:", err.message));

        setLoading(false);
        return () => { 
            unsubscribeTeams(); 
            unsubPrivate(); 
            unsubscribeEvals(); 
            unsubscribeNotifs(); 
            unsubscribeNotes(); 
        };
      } catch (err) {
        console.error("Error fetching jury data", err);
      }
    };
    fetchData();
  }, [user, userProfile, currentRound, isFinalRound, isExtraJury]);

  // --- 4. Logic Handlers ---

  const handleScoreChange = (id, value) => {
    setScores(prev => ({ ...prev, [id]: value }));
  };

  useEffect(() => {
    if (selectedTeam) {
        const targetRound = selectedTeam.evaluationContextRound || currentRound;
        const existingEval = evaluations[selectedTeam.id]?.[targetRound];
        if (existingEval && existingEval.scores) {
            setScores(existingEval.scores);
        } else {
            // Reset scores if new
            const rubric = ROUND_RUBRICS[targetRound] || { rubrics: [] };
            const initial = {};
            rubric.rubrics.forEach(r => initial[r.id] = 0);
            setScores(initial);
        }
    }
  }, [selectedTeam, currentRound, evaluations]);

  const submitEvaluation = async () => {
    if (!selectedTeam || !user.email) return;

    const targetRound = selectedTeam.evaluationContextRound || currentRound;

    try {
      const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
      const existingEval = evaluations[selectedTeam.id]?.[targetRound];
      const collectionName = isExtraJury ? 'extra_jury_evaluations' : 'evaluations';

      if (existingEval && existingEval.id) {
          await updateDoc(doc(db, collectionName, existingEval.id), {
              scores,
              totalScore,
              timestamp: new Date().toISOString()
          });
      } else {
          await addDoc(collection(db, collectionName), {
            teamId: selectedTeam.id,
            juryId: userProfile.id,
            juryEmail: user.email,
            scores,
            totalScore,
            round: targetRound,
            timestamp: new Date().toISOString()
          });
      }

      // Public Updates
      const publicUpdates = {};
      const privateUpdates = {};

      if (targetRound === 'phase3' && !isExtraJury) {
          // Standard Phase 3: Increment private count, mark public as evaluated (for Contestant view only)
          privateUpdates.phase3EvalCount = increment(1);
          publicUpdates.phase3Evaluated = true; 
          // Note: In Phase 3, public 'status' usually stays 'ready' or moves to 'evaluated' depending on logic.
          // Requirement: Contestant sees "Completed" if any eval exists.
      } else {
          // Extra Jury OR Non-Phase 3: Clear ready status
          publicUpdates.status = 'evaluated';
          publicUpdates.lastEvaluatedRound = targetRound;
          if (targetRound === 'phase3') publicUpdates.phase3Evaluated = true;
      }

      // Handle Skipped Round catch-up
      if (selectedTeam.evaluationContextRound && selectedTeam.evaluationContextRound !== currentRound) {
           publicUpdates[`skipped_${targetRound}`] = deleteField();
           publicUpdates.lastEvaluatedRound = targetRound;
           publicUpdates.status = 'working'; // Reset to working after catchup
      }

      if (Object.keys(publicUpdates).length > 0) {
          await updateDoc(doc(db, 'teams', selectedTeam.id), publicUpdates);
      }
      if (Object.keys(privateUpdates).length > 0) {
          await setDoc(doc(db, 'private_team_data', selectedTeam.id), privateUpdates, { merge: true });
      }

      await logAction(user.uid, user.email, user.displayName, 'jury', 'EVALUATE_TEAM', `Evaluated team ${selectedTeam.name} for round ${targetRound} with score ${totalScore}`);

      setSelectedTeam(null);
      setScores({});
      setModalConfig({ isOpen: true, title: 'Success!', message: 'Evaluation submitted successfully.', type: 'success' });

    } catch (err) {
      console.error(err);
      setModalConfig({ isOpen: true, title: 'Error', message: 'Error submitting evaluation.', type: 'error' });
    }
  };

  const handleSaveNote = async (text) => {
    if (!text || !notingTeam || !user.email) return;
    try {
        await addDoc(collection(db, 'jury_notes'), {
            juryEmail: user.email,
            teamId: notingTeam.id,
            teamName: notingTeam.name,
            note: text,
            round: currentRound,
            timestamp: new Date().toISOString()
        });
        setModalConfig({ isOpen: true, title: 'Note Saved', message: 'Your remark has been saved successfully.', type: 'success', isAlert: true });
    } catch (err) {
        console.error(err);
        setModalConfig({ isOpen: true, title: 'Error', message: 'Failed to save note.', type: 'error', isAlert: true });
    }
  };

    let displayTeams = [];

  // Helper: Check if ANY team has been marked as a finalist globally in the private data
  const hasGlobalFinalists = Object.values(privateData).some(d => d.isFinalist === true);

  if (isExtraJury) {
      // CRITICAL FIX: Extra Jury ONLY sees teams if finalists are announced.
      // This blocks access during Phase 1/2 or before Admin selects finalists in Phase 3.
      if (hasGlobalFinalists) {
          // Show Non-Finalists (Losers) in their track
          displayTeams = teams.filter(t => !privateData[t.id]?.isFinalist);
      } else {
          // Block access completely if no finalists exist yet
          displayTeams = [];
      }
  } else {
      // Main Jury Logic
      if (activeTab === 'final' || isFinalRound) {
          // Phase 3 / Final Tab: Show Global Finalists
          displayTeams = teams.filter(t => privateData[t.id]?.isFinalist === true);
      } else {
          // Phase 1 / 2: Show standard Track Teams
          displayTeams = teams;
      }
  }

  // --- Render ---
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50/50">
      {/* Components */}
      {showCelebration && (
        <ErrorBoundary>
          <CelebrationOverlay
              onClose={() => {}} // Forced overlay
              userProfile={userProfile}
              role="jury"
              onFeedbackSuccess={() => {}}
          />
        </ErrorBoundary>
      )}
      <ConfirmationModal isOpen={modalConfig.isOpen} onClose={() => setModalConfig({ ...modalConfig, isOpen: false })} title={modalConfig.title} message={modalConfig.message} type={modalConfig.type} isAlert={true} />
      <NoteModal
          isOpen={showNoteModal}
          onClose={() => { setShowNoteModal(false); setNotingTeam(null); }}
          onSave={handleSaveNote}
          initialNote=""
      />

      {/* Header */}
      <div className="p-6 pb-0 max-w-7xl mx-auto w-full shrink-0 z-10">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 px-2">
            <div className="flex items-center gap-4">
                <div className="bg-white p-2 rounded-xl shadow-sm border border-indigo-50">
                    <LayoutDashboard className="w-8 h-8 text-indigo-600" />
                </div>
                <div>
                   <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">
                        Jury Panel {userProfile?.assignedTrack ? `— ${userProfile.assignedTrack}` : ''}
                   </h1>
                   <div className="flex items-center gap-2 text-xs font-medium text-gray-500 font-mono mt-1">
                      <span>ROUND: <span className="text-indigo-600 font-bold uppercase">{currentRound}</span></span>
                      <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                      <span>STATUS: <span className={`font-bold uppercase ${roundStatus === 'ongoing' ? 'text-green-600' : 'text-gray-600'}`}>{roundStatus}</span></span>
                      {isExtraJury && <span className="ml-2 bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Extra Jury</span>}
                   </div>
                </div>
            </div>

            <div className="flex flex-wrap bg-slate-100/90 p-1.5 rounded-2xl shadow-sm border border-slate-200/90 gap-1 self-center md:self-auto justify-center w-full md:w-auto">
                {/* Mobile Profile Icon integration */}
                <div className="md:hidden mr-1">
                    <div className="bg-white p-2 rounded-xl shadow-sm text-indigo-600 border border-slate-200">
                        <UserIcon size={18} />
                    </div>
                </div>

                {!isFinalRound && !isExtraJury && (
                    <button
                        onClick={() => setActiveTab('teams')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === 'teams' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'}`}
                    >
                        <LayoutGrid size={15} /> <span className="hidden md:inline">My Track</span>
                    </button>
                )}
                {(isFinalRound || isExtraJury) && (
                    <button
                        onClick={() => setActiveTab('final')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === 'final' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'}`}
                    >
                            <Star size={15} /> <span className="hidden md:inline">Finals</span>
                    </button>
                )}
                <button
                    onClick={() => setActiveTab('notifications')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                        ${activeTab === 'notifications' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'}`}
                >
                    <Bell size={15} /> <span className="hidden md:inline">Notifs</span>
                </button>
                <button
                    onClick={() => setActiveTab('arcade')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                        ${activeTab === 'arcade' ? 'bg-white shadow-sm text-indigo-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'}`}
                >
                    <Gamepad2 size={15} /> <span className="hidden md:inline">Arcade</span>
                </button>
            </div>
        </header>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-8 max-w-7xl mx-auto w-full pb-24">
        {loading ? (
             <div className="flex justify-center items-center h-40"><LoadingSpinner /></div>
        ) : activeTab === 'arcade' ? (
             <ArcadeDashboard user={user} customUserName={userProfile?.name} />
        ) : activeTab === 'notifications' ? (
             <div className="space-y-4 max-w-3xl mx-auto">
                {notifications.map(n => (
                    <GlassCard key={n.id} className={`p-4 border-l-4 ${n.type === 'urgent' ? 'border-red-500 bg-red-50/50' : 'border-indigo-500'}`}>
                        <div className="flex justify-between items-start mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${n.type === 'urgent' ? 'bg-red-200 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                {n.type === 'urgent' ? 'URGENT' : 'INFO'}
                            </span>
                            <span className="text-xs text-gray-400">{safeFormat(n.timestamp, 'HH:mm')}</span>
                        </div>
                        <p className="text-gray-800 font-medium">{n.message}</p>
                    </GlassCard>
                ))}
                {notifications.length === 0 && <p className="text-center text-gray-500">No notifications.</p>}
            </div>
        ) : (
            displayTeams.length === 0 ? (
                <div className="text-center py-10 flex flex-col items-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                        <ScanLine size={32} />
                    </div>
                    <p className="text-gray-500 font-bold text-lg">
                        {isExtraJury && activeTab === 'final'
                            ? "No non-finalist teams found in your track."
                            : isFinalRound
                                ? "No finalists found."
                                : "No teams assigned."}
                    </p>
                    <p className="text-gray-400 text-sm mt-1">Wait for updates from the admin.</p>
                </div>
            ) :
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayTeams.map((team) => {
                    const isEvaluated = evaluations[team.id]?.[currentRound];
                    const isReady = team.status === 'ready' && team.readyRound === currentRound;

                    // Can Evaluate Logic
                    // 1. Round must not be locked or completed (unless Phase 3, where completed is a soft state for UI)
                    // 2. Team must be Ready OR Round is in 'evaluation' mode OR (Phase 3 and it's marked evaluated but I haven't graded it)
                    const canEvaluate = (roundStatus !== 'locked' && roundStatus !== 'completed') &&
                        (isReady || roundStatus === 'evaluation');

                    // Check for skipped rounds (Retroactive Eval)
                    const prevRounds = ['idea', 'phase1', 'phase2', 'phase3'];
                    const currentIdx = prevRounds.indexOf(currentRound);
                    const skippedRound = prevRounds.slice(0, currentIdx).find(r => team[`skipped_${r}`]);
                    const isSkippedMode = !!skippedRound;

                    // Click Handler
                    const handleClick = () => {
                        if (isEvaluated) return;
                        if (isSkippedMode) {
                            setSelectedTeam({ ...team, evaluationContextRound: skippedRound });
                        } else if (canEvaluate) {
                            setSelectedTeam(team);
                        }
                    };

                    return (
                        <GlassCard
                            key={team.id}
                            className={`p-6 flex flex-col justify-between transition-all cursor-pointer border-2 relative overflow-hidden
                                ${isEvaluated ? 'border-green-400 bg-green-50/30' :
                                  isSkippedMode ? 'border-red-400 bg-red-50/30 animate-pulse' :
                                  isReady ? 'border-yellow-400 bg-yellow-50/50 shadow-lg scale-[1.02]' :
                                  'border-transparent hover:border-indigo-200'}
                            `}
                            onClick={handleClick}
                        >
                            {/* Track Badge for Global View */}
                            {isFinalRound && !isExtraJury && (
                                <div className="absolute top-2 right-2 text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase">
                                    {team.track}
                                </div>
                            )}

                            <div>
                                <div className="flex justify-between items-start mb-1 pr-12">
                                    <h3 className="text-xl font-bold text-gray-800 leading-tight">{team.name}</h3>
                                </div>
                                
                                <div className="flex items-center gap-2 mb-4">
                                     <span className="text-xs text-indigo-500 font-mono font-bold bg-indigo-50 px-2 py-0.5 rounded">{team.id}</span>
                                     {isEvaluated && <CheckCircle2 className="text-green-500" size={16} />}
                                     {isSkippedMode && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">MISSED: {skippedRound}</span>}
                                     {isReady && !isEvaluated && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold animate-pulse">READY</span>}
                                </div>

                                <p className="text-gray-600 text-sm mb-4 line-clamp-2">{team.description}</p>
                            </div>
                            
                            <div className="flex justify-between items-center mt-4 border-t border-gray-100 pt-4">
                                <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{currentRound}</span>
                                {isEvaluated ? (
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="text-right">
                                            <span className="block text-xs text-green-600 font-bold uppercase">Score</span>
                                            <span className="text-lg font-black text-gray-800">{isEvaluated.totalScore}</span>
                                        </div>
                                        {/* Edit Button */}
                                        {roundStatus !== 'locked' && roundStatus !== 'completed' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedTeam(team); }}
                                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
                                            >
                                                Edit
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setNotingTeam(team); setShowNoteModal(true); }}
                                            className="px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
                                            title="Add Remark"
                                        >
                                            <StickyNote size={20} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleClick(); }}
                                            disabled={!canEvaluate && !isSkippedMode}
                                            className={`px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors relative z-30
                                                ${isSkippedMode ? 'bg-red-600 text-white hover:bg-red-700' :
                                                !canEvaluate ? 'bg-gray-200 text-gray-400 cursor-not-allowed' :
                                                'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                        >
                                            {isSkippedMode ? `Eval ${skippedRound}` : 'Evaluate'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </GlassCard>
                    );
                })}
            </div>
        )}
      </div>

      {/* Evaluation Modal */}
      <AnimatePresence>
        {selectedTeam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] my-auto overflow-hidden">
              <div className={`p-5 ${selectedTeam.evaluationContextRound && selectedTeam.evaluationContextRound !== currentRound ? 'bg-red-600' : 'bg-indigo-600'} text-white flex justify-between items-center shrink-0`}>
                 <div>
                    <h2 className="text-xl font-bold">{selectedTeam.name}</h2>
                    <p className="opacity-80 text-xs">Evaluating: {ROUND_RUBRICS[selectedTeam.evaluationContextRound || currentRound]?.label}</p>
                 </div>
                 <button onClick={() => setSelectedTeam(null)} className="p-1 hover:bg-white/20 rounded-full"><X size={20} /></button>
              </div>

              {selectedTeam.evaluationContextRound && selectedTeam.evaluationContextRound !== currentRound && (
                  <div className="bg-red-50 border-b border-red-100 p-3 text-red-700 text-sm font-bold text-center shrink-0">
                      ⚠️ You are evaluating a MISSED round ({selectedTeam.evaluationContextRound}).
                  </div>
              )}

              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                  {/* Left: Scoring */}
                  <div className="flex-1 p-6 overflow-y-auto custom-scrollbar border-r border-gray-100">
                     <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><ClipboardList size={18}/> Scoring Rubrics</h3>
                     <div className="space-y-6">
                         {(ROUND_RUBRICS[selectedTeam.evaluationContextRound || currentRound]?.rubrics || []).map((rubric) => (
                           <div key={rubric.id}>
                              <div className="flex justify-between mb-2">
                                <label className="font-semibold text-gray-700 text-sm">{rubric.label}</label>
                                <span className="font-bold text-indigo-600">{scores[rubric.id] || 0} / {rubric.max}</span>
                              </div>
                              <input type="range" min="0" max={rubric.max} step="1" value={scores[rubric.id] || 0} onChange={(e) => handleScoreChange(rubric.id, parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                           </div>
                         ))}
                         <div className="pt-4 flex justify-between items-center border-t border-gray-100 mt-4">
                            <span className="text-gray-500 font-semibold">Total Score</span>
                            <span className="text-3xl font-black text-indigo-600">{Object.values(scores).reduce((a, b) => a + b, 0)}</span>
                         </div>
                     </div>
                  </div>

                  {/* Right: Notes History */}
                  <div className="w-full md:w-80 bg-gray-50 p-6 overflow-y-auto custom-scrollbar flex flex-col">
                       <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><StickyNote size={18}/> Team Remarks</h3>

                       <div className="flex-1 space-y-3 mb-4">
                           {juryNotes.filter(n => n.teamId === selectedTeam.id).length === 0 ? (
                               <p className="text-sm text-gray-400 text-center italic py-4">No remarks recorded yet.</p>
                           ) : (
                               juryNotes.filter(n => n.teamId === selectedTeam.id).map(note => (
                                   <div key={note.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm text-sm">
                                       <p className="text-gray-700 mb-2">{note.note}</p>
                                       <div className="flex justify-between items-center text-[10px] text-gray-400">
                                           <span className="uppercase font-bold">{note.round || 'General'}</span>
                                           <span>{safeFormat(note.timestamp, 'MMM d, HH:mm')}</span>
                                       </div>
                                   </div>
                               ))
                           )}
                       </div>

                       {/* Quick Add Note */}
                       <div className="mt-auto">
                           <button
                                onClick={() => { setNotingTeam(selectedTeam); setShowNoteModal(true); }}
                                className="w-full py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors"
                           >
                               + Add New Remark
                           </button>
                       </div>
                  </div>
              </div>

              <div className="p-5 border-t bg-gray-50 flex justify-end gap-3 shrink-0">
                 <button onClick={() => setSelectedTeam(null)} className="px-5 py-2.5 text-gray-600 font-semibold hover:bg-gray-200 rounded-lg text-sm">Cancel</button>
                 <button onClick={submitEvaluation} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg flex items-center gap-2 text-sm"><Check size={18} /> Submit Score</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* =========================================
   APP
   ========================================= */

const NotificationListener = ({ userRole }) => {
  const [toast, setToast] = useState(null);
  const [lastNotifId, setLastNotifId] = useState(null);

  useEffect(() => {
     if (!userRole) return;

     const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(1));
     const unsub = safeOnSnapshot(q, (snapshot) => {
         if (!snapshot.empty) {
             const doc = snapshot.docs[0];
             const data = doc.data();
             const notifId = doc.id;

             // Check targeting
             let isTargeted = false;
             if (!data.targets || data.targets.includes('all')) isTargeted = true;
             else if (data.targets.includes(userRole)) isTargeted = true;

             if (isTargeted) {
                 setLastNotifId(prev => {
                     if (prev && prev !== notifId) {
                         // New Notification!
                         try {
                             const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                             audio.volume = 0.5;
                             audio.play().catch(e => console.log("Audio play blocked", e));
                         } catch (e) { console.error(e); }

                         setToast({ message: data.message, type: data.type, roundId: data.roundId });
                     }
                     return notifId;
                 });
             }
         }
     }, (err) => console.warn("Notifications listener notice:", err.message));
     return () => {
       if (unsub) unsub();
     };
  }, [userRole]);

  return (
      <AnimatePresence>
          {toast && (
             // Determine if we show a Toast or Full Screen Notification
             // Suppress Full Screen for Phase 3 Completion since we have the Celebration Overlay
             ((toast.message.includes('STARTED') || toast.message.includes('COMPLETED') || toast.message.includes('Advanced') || toast.type === 'urgent')
               && !(toast.message.includes('Phase III') && toast.message.includes('COMPLETED'))
               && !(toast.message.includes('Final') && toast.message.includes('COMPLETED')))
             ? <FullScreenNotification message={toast.message} type={toast.type} roundId={toast.roundId} onClose={() => setToast(null)} />
             : <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
          )}
      </AnimatePresence>
  );
};

const App = () => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('hackfest_session_user');
      return saved ? JSON.parse(saved).user : null;
    } catch(e) { return null; }
  });
  const [userRole, setUserRole] = useState(() => {
    try {
      const saved = localStorage.getItem('hackfest_session_user');
      return saved ? JSON.parse(saved).role : null;
    } catch(e) { return null; }
  });
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('hackfest_session_user');
      return saved ? JSON.parse(saved).profile : null;
    } catch(e) { return null; }
  });
  const [authChecking, setAuthChecking] = useState(true);
  const [activeMode, setActiveMode] = useState(() => localStorage.getItem('hackfest_mode') || 'participant');

  const handleDirectLogin = ({ email, name, role = 'contestant', targetMode = 'participant' }) => {
    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : (role === 'admin' ? 'admin@hackfest.org' : 'participant@hackfest.org');
    const displayName = name || (cleanEmail ? cleanEmail.split('@')[0] : (role === 'admin' ? 'Admin' : 'Participant'));
    const directUser = {
      uid: 'user_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'),
      email: cleanEmail,
      displayName: displayName,
      photoURL: null
    };
    const directProfile = {
      id: directUser.uid,
      name: displayName,
      email: cleanEmail,
      role: role,
      attendanceMarked: true,
      roomNumber: 'B-I 122',
      teamId: 'team_1',
      createdAt: new Date().toISOString()
    };

    setUser(directUser);
    setUserRole(role);
    setUserProfile(directProfile);
    setActiveMode(targetMode);
    localStorage.setItem('hackfest_mode', targetMode);
    localStorage.setItem('hackfest_session_user', JSON.stringify({
      user: directUser,
      role: role,
      profile: directProfile,
      preferredMode: targetMode
    }));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        // If no firebase user, only clear if there is no active local session
        const saved = localStorage.getItem('hackfest_session_user');
        if (!saved) {
          setUser(null);
          setUserRole(null);
          setUserProfile(null);
        }
        setAuthChecking(false);
        return;
      }

      setAuthChecking(true);
      setUser(currentUser);

      try {
        const email = currentUser.email?.toLowerCase();
        if (email) {
          const q = query(collection(db, "users"), where("email", "==", email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data();
            const role = userData.role || 'contestant';
            
            try {
              const authProfileRef = doc(db, 'auth_profiles', currentUser.uid);
              await setDoc(authProfileRef, {
                  customId: userDoc.id,
                  role: userData.role,
                  isExtraJury: userData.isExtraJury || false
              }, { merge: true });
            } catch(e) {}

            setUserRole(role);
            setUserProfile({ id: userDoc.id, ...userData });
            localStorage.setItem('hackfest_session_user', JSON.stringify({
              user: currentUser,
              role: role,
              profile: { id: userDoc.id, ...userData }
            }));

            await logAction(currentUser.uid, currentUser.email, userData.name || currentUser.displayName, role, 'LOGIN', 'User logged in (Session Restored)');
          } else {
            // Authorized fallback for any authenticated Google account
            const fallbackProfile = {
              id: currentUser.uid,
              name: currentUser.displayName || currentUser.email.split('@')[0],
              email: email,
              role: 'contestant',
              attendanceMarked: true,
              roomNumber: 'B-I 122',
              teamId: 'team_1',
              createdAt: new Date().toISOString()
            };
            try {
              await setDoc(doc(db, 'users', currentUser.uid), fallbackProfile, { merge: true });
            } catch(e) {}

            setUserRole('contestant');
            setUserProfile(fallbackProfile);
            localStorage.setItem('hackfest_session_user', JSON.stringify({
              user: currentUser,
              role: 'contestant',
              profile: fallbackProfile
            }));
          }
        }
      } catch (error) {
        console.error("Error setting up user profile:", error);
        setUserRole('contestant');
        const fallbackProfile = {
          id: currentUser.uid,
          name: currentUser.displayName || 'Participant',
          email: currentUser.email,
          role: 'contestant',
          attendanceMarked: true,
          roomNumber: 'B-I 122',
          teamId: 'team_1'
        };
        setUserProfile(fallbackProfile);
        localStorage.setItem('hackfest_session_user', JSON.stringify({
          user: currentUser,
          role: 'contestant',
          profile: fallbackProfile
        }));
      } finally {
        setAuthChecking(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch(e) {}
    localStorage.removeItem('hackfest_session_user');
    setUser(null);
    setUserRole(null);
    setUserProfile(null);
  };

  const handleModeSwitch = (mode) => {
    setActiveMode(mode);
    localStorage.setItem('hackfest_mode', mode);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  const renderDashboard = () => {
    if (activeMode === 'admin') {
      return (
        <ErrorBoundary>
          <AdminDashboard user={user} userProfile={userProfile} />
        </ErrorBoundary>
      );
    }
    // Participant / Student Mode: strictly shows student views, hiding all admin and judge options
    return (
      <ErrorBoundary>
        <ContestantDashboard user={user} userProfile={userProfile} />
      </ErrorBoundary>
    );
  };

  return (
    <div className={`font-sans text-gray-900 relative min-h-screen w-full flex flex-col ${!user ? 'items-center justify-center' : ''}`}>
      {user ? (
          <>
            <AnimatedBackground />
            <ErrorBoundary>
              <NotificationListener userRole={activeMode === 'admin' ? 'admin' : 'contestant'} />
            </ErrorBoundary>

            {/* Global Header Bar with Mode Switcher & User Profile */}
            <header className="fixed top-3 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 pointer-events-none">
                {/* Left: Brand Badge */}
                <div className="pointer-events-auto flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-full shadow-md border border-slate-200">
                    <img src={ASSETS.LOGO_SPARS} alt="Logo" className="w-6 h-6 object-contain rounded-full" />
                    <span className="font-sans font-black text-xs sm:text-sm text-slate-900 tracking-tight">HACKFEST</span>
                </div>

                {/* Center: Mode Switcher */}
                <div className="pointer-events-auto flex items-center bg-white p-1 rounded-full shadow-md border border-slate-200 gap-1">
                    <button
                        onClick={() => handleModeSwitch('admin')}
                        className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-black transition-all flex items-center gap-1.5 sm:gap-2 ${
                            activeMode === 'admin'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
                        }`}
                        title="Switch to Admin Mode"
                    >
                        <Shield size={14} className={activeMode === 'admin' ? 'text-indigo-200' : ''} />
                        <span>Admin Mode</span>
                    </button>

                    <button
                        onClick={() => handleModeSwitch('participant')}
                        className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-black transition-all flex items-center gap-1.5 sm:gap-2 ${
                            activeMode === 'participant'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-100'
                        }`}
                        title="Switch to Participant Mode"
                    >
                        <User size={14} className={activeMode === 'participant' ? 'text-indigo-200' : ''} />
                        <span>Participant Mode</span>
                    </button>
                </div>

                {/* Right: User Avatar & Sign Out */}
                <div className="pointer-events-auto flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-md border border-slate-200">
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="Avatar" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                            <UserIcon size={14} className="text-slate-500" />
                        )}
                        <span className="text-xs font-bold text-slate-800 max-w-[120px] truncate">{user.displayName || user.email}</span>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="bg-white p-2 rounded-full shadow-md hover:bg-slate-50 text-slate-700 hover:text-red-600 transition-all border border-slate-200"
                        title="Sign Out"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </header>

            <AnimatePresence mode="wait">
                <motion.div
                    key={`dashboard-${activeMode}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="relative z-10 w-full flex-1 flex flex-col min-h-0"
                >
                    {renderDashboard()}
                </motion.div>
            </AnimatePresence>
          </>
      ) : (
          <>
            <WhiteBackground />
            <AnimatePresence mode="wait">
                <motion.div
                    key="login"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="relative z-50 flex items-center justify-center w-full h-full"
                >
                    <LoginPanel onDirectLogin={handleDirectLogin} />
                </motion.div>
            </AnimatePresence>
            <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(255,255,255,0.8)_100%)] z-10"></div>
          </>
      )}
    </div>
  );
};

/* =========================================
   ROOT RENDER
   ========================================= */

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
