
import React from 'react';
import type { Stats } from '../types';

interface StatsPanelProps {
    stats: Stats;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ stats }) => {
    return (
        <div id="gui-stats" className="ui-box fixed top-4 right-4 p-4 rounded-lg shadow-lg w-52 text-sm z-10">
            <h2 className="text-lg font-bold mb-2 border-b border-gray-600 pb-1">Live Stats</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                <span className="font-semibold">Liquid Temp:</span>
                <span className={`text-right font-bold ${stats.bowlTemp > 300 ? 'temp-hot' : ''}`}>
                    {Math.round(stats.bowlTemp)}°C
                </span>

                <span className="font-semibold">Vapor:</span>
                <span className="text-right">{stats.vaporCount}</span>
                
                <span className="font-semibold">Residue:</span>
                <span className="text-right">{stats.residueCount}</span>

                <span className="font-semibold">Roll:</span>
                <span className="text-right">{Math.round(stats.pipeRotation)}°</span>
                
                <span className="font-semibold">Heating:</span>
                <span className={`text-right ${stats.isHeating ? 'status-on' : 'status-off'}`}>
                    {stats.isHeating ? 'ON' : 'OFF'}
                </span>

                <span className="font-semibold">Inhaling:</span>
                <span className={`text-right ${stats.isInhaling ? 'status-on' : 'status-off'}`}>
                    {stats.isInhaling ? 'ON' : 'OFF'}
                </span>
            </div>
        </div>
    );
};

export default StatsPanel;
