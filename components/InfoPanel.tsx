
import React from 'react';

interface InfoPanelProps {
    initialShardSize: number;
    onShardSizeChange: (size: number) => void;
}

const InfoPanel: React.FC<InfoPanelProps> = ({ initialShardSize, onShardSizeChange }) => {
    return (
        <div id="info" className="ui-box fixed top-4 left-4 p-4 rounded-lg shadow-lg max-w-xs text-sm z-10">
            <h1 className="text-lg font-bold mb-2">3D Vapor Simulation</h1>
            <ul className="list-none space-y-2">
                <li><span className="font-bold">Rotate/Zoom:</span> Click & Drag / Scroll</li>
                <li><span className="font-bold">Toggle Roll (±45°):</span> Q / E Keys</li>
                <li><span className="font-bold">Heat:</span> Click, Hold & Drag Torch</li>
                <li><span className="font-bold">Inhale:</span> Hold Spacebar</li>
            </ul>
            <div className="mt-4 pt-2 border-t border-gray-600">
                <label htmlFor="shard-size-slider" className="block font-bold mb-1">Shard Size</label>
                <input 
                    type="range" 
                    id="shard-size-slider" 
                    min="0.1" 
                    max="1.5" 
                    defaultValue={initialShardSize} 
                    step="0.01"
                    onChange={(e) => onShardSizeChange(parseFloat(e.target.value))}
                />
            </div>
        </div>
    );
};

export default InfoPanel;
