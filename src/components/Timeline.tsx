import React from 'react';
import { TIMELINE_TEMPLATES } from '../constants';

interface TimelineProps {
  templateId: string;
  customImage?: string;
}

export const Timeline: React.FC<TimelineProps> = ({ templateId, customImage }) => {
  if (customImage) {
    return (
      <div className="my-8 w-full flex justify-center">
        <img
          src={customImage}
          alt="Custom timeline"
          className="max-h-64 w-full object-contain rounded border border-gray-200 shadow-sm"
        />
      </div>
    );
  }

  const template =
    TIMELINE_TEMPLATES.find(t => t.id === templateId) ?? TIMELINE_TEMPLATES[0];

  if (!template) {
    return (
      <div className="my-8 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
        Timeline template not available.
      </div>
    );
  }

  return (
    <div className="my-8">
      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-lpBlue font-bold uppercase tracking-wide text-sm">
          Case Timeline
        </h3>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {template.name}
        </span>
      </div>
      <div className="relative overflow-hidden px-2">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-200" />
        <div className="flex justify-between items-center relative text-xs md:text-sm">
          {template.steps.map((step, index) => (
            <div
              key={`${step.label}-${index}`}
              className="flex flex-col items-center text-center px-2 flex-1"
            >
              <div className="w-8 h-8 flex items-center justify-center rounded-full border-2 border-lpBlue bg-white text-lpBlue font-bold shadow-sm">
                {index + 1}
              </div>
              <div className="mt-2 font-semibold text-gray-800">{step.label}</div>
              {step.sub && (
                <div className="text-gray-500 text-[11px] mt-0.5">{step.sub}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

