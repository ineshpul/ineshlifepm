import logo from "../../imports/image-1.png";

export function Brandmark({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <img 
      src={logo} 
      alt="Leap Logo" 
      className={className}
      style={{ mixBlendMode: 'multiply' }}
    />
  );
}

/** Same component; common alternate spelling for imports/JSX. */
export const BrandMark = Brandmark;