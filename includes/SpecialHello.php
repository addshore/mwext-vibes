<?php

namespace MediaWiki\Extension\Examples;

use SpecialPage;

class SpecialHello extends SpecialPage {
	public function __construct() {
		parent::__construct( 'ExamplesHello' );
	}

	public function execute( $subPage ) {
		$this->setHeaders();
		$out = $this->getOutput();
		$out->setPageTitle( $this->msg( 'exampleshello' )->text() ); // Set page title

		// Add the Chart.js library directly from CDN
		$out->addScript( '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>' );
		 // Remove the date adapter script - no longer needed
		// $out->addScript( '<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js"></script>' );

		// Load our game resources
		$out->addModules( 'ext.examples.hello' );

		// Add HTML structure for the game UI (Score, Lives)
		$out->addHTML( '<div id="game-ui" style="position: fixed; top: 10px; right: 10px; z-index: 1200; background: rgba(0,0,0,0.5); color: white; padding: 5px 10px; border-radius: 5px;">' );
		$out->addHTML( 'Score: <span id="game-score">0</span> | Lives: <span id="game-lives">3</span>' );
		$out->addHTML( '</div>' );

		// Add HTML for the aggregate chart (rename canvas ID for clarity)
		$out->addHTML( '<div id="aggregate-chart-container" style="position: absolute; bottom: 10px; left: 10px; width: 250px; height: 150px; z-index: 990; opacity: 0.7;">' );
		$out->addHTML( '<canvas id="aggregateDestructionChart"></canvas>' );
		$out->addHTML( '</div>' );

		// Add a container where game elements might be added, or rely on #mw-content-text
		// $out->addHTML( '<div id="game-container" style="position: relative; width: 100%; height: calc(100vh - 100px); /* Adjust height as needed */"></div>' );

		// Remove old stats/chart HTML
		// $out->addHTML( '<div id="collision-stats">' );
		// ... old stats ...
		// $out->addHTML( '</div>' );
	}
}
