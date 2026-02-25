"use client";

import { useEffect, useState } from "react";

interface ComplianceScoreGaugeProps {
  score: number;
  size?: number;
}

export default function ComplianceScoreGauge({ score, size = 200 }: ComplianceScoreGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = size / 2 - 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const increment = score / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= score) {
        setAnimatedScore(score);
        clearInterval(timer);
      } else {
        setAnimatedScore(current);
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [score]);

  const getColor = () => {
    if (score >= 90) return "#10B981"; // green
    if (score >= 70) return "#3B82F6"; // blue
    if (score >= 50) return "#F59E0B"; // amber
    return "#EF4444"; // red
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E5E7EB"
            strokeWidth="16"
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={getColor()}
            strokeWidth="16"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-5xl font-bold" style={{ color: getColor() }}>
              {Math.round(animatedScore)}%
            </div>
            <div className="text-sm text-gray-600 mt-1">Compliance</div>
          </div>
        </div>
      </div>
    </div>
  );
}
