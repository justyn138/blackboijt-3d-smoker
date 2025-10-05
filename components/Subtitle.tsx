
import React from 'react';

interface SubtitleProps {
    text: string;
    isVisible: boolean;
}

const Subtitle: React.FC<SubtitleProps> = ({ text, isVisible }) => {
    return (
        <div 
            id="subtitle-container"
            className={`fixed bottom-1/4 left-1/2 -translate-x-1/2 text-3xl font-bold z-20 ${isVisible ? 'opacity-100' : 'opacity-0 hidden'}`}
        >
            <div id="subtitle-text">
                {text}
            </div>
        </div>
    );
};

export default Subtitle;
