
import React, { useMemo } from 'react';
import { PORTRAIT_CALM_SRC, PORTRAIT_STIMULATED_SRC, PORTRAIT_FRANTIC_SRC } from '../constants';

interface StimulationPanelProps {
    stimulationLevel: number;
}

const StimulationPanel: React.FC<StimulationPanelProps> = ({ stimulationLevel }) => {
    
    const portraitSrc = useMemo(() => {
        if (stimulationLevel > 70) {
            return PORTRAIT_FRANTIC_SRC;
        } else if (stimulationLevel > 30) {
            return PORTRAIT_STIMULATED_SRC;
        } else {
            return PORTRAIT_CALM_SRC;
        }
    }, [stimulationLevel]);

    return (
        <div id="stimulation-ui" className="ui-box fixed bottom-8 left-8 p-4 rounded-lg shadow-lg flex items-center space-x-4 z-10 w-80">
            <img id="portrait" src={portraitSrc} className="w-28 h-28 rounded-full bg-gray-200" alt="Character Portrait" />
            <div className="flex-grow">
                <span className="text-xl font-bold capitalize">Tweak-o-meter</span>
                <div id="stimulation-meter-bg" className="w-full h-6 rounded-full mt-2">
                    <div id="stimulation-meter-bar" className="h-6" style={{ width: `${stimulationLevel}%` }}></div>
                </div>
            </div>
        </div>
    );
};

export default StimulationPanel;
