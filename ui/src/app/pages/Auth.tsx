import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Brandmark } from '../components/Brandmark';
import { authService } from '../services/mockAuth';

export function Auth() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(true);

  const handleSubmit = async () => {
    setError('');
    
    try {
      if (isSignUp) {
        if (!username || !email || !password) {
          setError('All fields are required');
          return;
        }
        await authService.signUp(username, email, password);
      } else {
        if (!email || !password) {
          setError('Email and password are required');
          return;
        }
        await authService.signIn(email, password);
      }
      
      navigate('/today');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div 
      className="flex-1 flex flex-col justify-center gap-5"
      style={{ padding: '28px 24px' }}
    >
      {/* Brand */}
      <div className="flex flex-col items-center gap-3">
        <div 
          className="flex items-center justify-center"
          style={{
            width: '88px',
            height: '88px',
          }}
        >
          <Brandmark className="w-full h-full" />
        </div>
        <div 
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--muted-2)',
          }}
        >
          Stop overthinking.
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-2.5">
        {isSignUp && (
          <div className="flex flex-col gap-1.5">
            <label 
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--muted-2)',
              }}
            >
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="what should we call you?"
              style={{
                height: '50px',
                borderRadius: '14px',
                border: '1px solid var(--line)',
                background: '#FAFBFC',
                padding: '0 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--ink)',
                outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--ink)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--line)'}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label 
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--muted-2)',
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{
              height: '50px',
              borderRadius: '14px',
              border: '1px solid var(--line)',
              background: '#FAFBFC',
              padding: '0 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--ink)',
              outline: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--ink)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--line)'}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label 
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'var(--muted-2)',
            }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="make it strong"
            style={{
              height: '50px',
              borderRadius: '14px',
              border: '1px solid var(--line)',
              background: '#FAFBFC',
              padding: '0 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--ink)',
              outline: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--ink)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--line)'}
          />
        </div>

        {error && (
          <div style={{ color: 'var(--coral)', fontSize: '12px', marginTop: '4px' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          style={{
            height: '52px',
            border: 0,
            borderRadius: '14px',
            background: 'var(--ink)',
            color: 'white',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'transform .12s, box-shadow .12s',
            marginTop: '4px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,17,23,.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Continue
        </button>

        <button
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError('');
          }}
          style={{
            color: 'var(--muted)',
            fontSize: '12px',
            marginTop: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  );
}
