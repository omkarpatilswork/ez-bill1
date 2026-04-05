import { useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [transitionState, setTransitionState] = useState<'enter' | 'exit'>('enter');
  const prevKey = useRef(location.key);

  useEffect(() => {
    if (location.key !== prevKey.current) {
      setTransitionState('exit');
      const timeout = setTimeout(() => {
        setDisplayChildren(children);
        setTransitionState('enter');
        prevKey.current = location.key;
      }, 150);
      return () => clearTimeout(timeout);
    } else {
      setDisplayChildren(children);
    }
  }, [location.key, children]);

  return (
    <div
      className={`transition-all duration-300 ease-out ${
        transitionState === 'enter'
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-2'
      }`}
    >
      {displayChildren}
    </div>
  );
}
