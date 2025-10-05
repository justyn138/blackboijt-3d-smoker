
import React, { useRef } from 'react';
import { useVaporSimulation } from './hooks/useVaporSimulation';
import InfoPanel from './components/InfoPanel';
import StatsPanel from './components/StatsPanel';
import StimulationPanel from './components/StimulationPanel';
import Subtitle from './components/Subtitle';
import { INITIAL_SHARD_SIZE } from './constants';

const App: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);
    const { stats, stimulationLevel, subtitle, handleShardSizeChange } = useVaporSimulation(mountRef);

    return (
        <div>
            <div ref={mountRef} className="fixed top-0 left-0 w-full h-full" />
            
            <InfoPanel 
                initialShardSize={INITIAL_SHARD_SIZE} 
                onShardSizeChange={handleShardSizeChange} 
            />
            <StatsPanel stats={stats} />
            <StimulationPanel stimulationLevel={stimulationLevel} />
            <Subtitle text={subtitle.text} isVisible={subtitle.visible} />
        </div>
    );
};

export default App;
