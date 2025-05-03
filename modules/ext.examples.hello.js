/**
 * JavaScript for the Examples extension - Asteroids-like game with flowers
 */
( function () {
	'use strict';

	// Configuration
	var config = {
		playerTurnSpeed: 5, // degrees per frame
		playerThrust: 0.1,
		playerMaxSpeed: 5,
		playerDrag: 0.98, // friction
		bulletSpeed: 7,
		bulletLifetime: 60, // frames
		shotDelay: 200, // ms between shots
		asteroidSpawnInterval: 1000, // How often to check if we need more asteroids (fallback)
		maxAsteroids: 15,
		asteroidBaseSpeed: 0.8,
		asteroidSpeedVariance: 0.7,
		playerRespawnInvincibility: 120, // frames
		collisionCheckInterval: 16, // ms, approx 60fps for game loop
		eventStreamUrl: 'https://stream.wikimedia.org/v2/stream/recentchange',
		tulipColors: [ 'red', 'pink', 'yellow', 'orange' ], // Added back tulip colors
		powerupSpawnScoreInterval: 10, // Spawn powerup every 10 points
		powerupSpeed: 1, // Speed of powerups
		// Sound config (ensure files exist)
		soundFiles: {
			shoot: mw.config.get( 'wgExtensionAssetsPath' ) + '/Examples/modules/shoot.mp3', // Needs a shoot sound
			playerHit: mw.config.get( 'wgExtensionAssetsPath' ) + '/Examples/modules/player_hit.mp3', // Needs a player hit sound
			// Reuse existing sounds for flower destruction
			sunflowerDestroy: mw.config.get( 'wgExtensionAssetsPath' ) + '/Examples/modules/whale.mp3',
			tulipDestroy: mw.config.get( 'wgExtensionAssetsPath' ) + '/Examples/modules/squeak.mp3',
			mixedDestroy: mw.config.get( 'wgExtensionAssetsPath' ) + '/Examples/modules/explosion.mp3',
			gameOver: mw.config.get( 'wgExtensionAssetsPath' ) + '/Examples/modules/game_over.mp3', // Added game over sound
			powerupSpawn: mw.config.get( 'wgExtensionAssetsPath' ) + '/Examples/modules/powerup_spawn.mp3', // Needs sound file
			powerupCollect: mw.config.get( 'wgExtensionAssetsPath' ) + '/Examples/modules/powerup_collect.mp3' // Needs sound file
		},
		points: { // Updated point values
			sunflower: 2,
			tulip: 1
		}
		// explosionParts, explosionRadius, explosionPartDuration (can reuse)
		// cloud config (can reuse)
	};

	// Game State
	var gameState = {
		score: 0,
		lives: 3,
		gameStarted: false,
		gameOver: false,
		paused: false,
		keys: {}, // Tracks currently pressed keys
		asteroids: [], // Replaces activeFlowers { id, element, type, size, x, y, vx, vy, angle, rotationSpeed, metadata }
		bullets: [], // { element, x, y, vx, vy, lifetime }
		explosions: [], // Can reuse existing explosion logic if needed
		powerups: [], // Added powerups array { element, type, x, y, vx, vy, radius }
		player: null, // { element, x, y, vx, vy, angle, invincibilityFrames }
		lastShotTime: 0,
		asteroidIdCounter: 0,
		powerupIdCounter: 0, // Added counter for powerups
		gameLoopId: null,
		eventSource: null,
		gameArea: null, // The #mw-content-text element
			// Aggregate Stats
		totalSunflowersDestroyed: 0,
		totalTulipsDestroyed: 0,
		totalPlayerDeaths: 0,
		aggregateChart: null, // Renamed chart variable
		nextPowerupScore: config.powerupSpawnScoreInterval // Score needed for next powerup
		// Removed timeSeriesData, currentSecondStats, timeSeriesIntervalId, maxTimeSeriesPoints
	};

	// Sounds
	var sounds = {};

	/** Preload sounds */
	function setupSounds() {
		for (const key in config.soundFiles) {
			sounds[key] = document.createElement('audio');
			sounds[key].src = config.soundFiles[key];
			sounds[key].preload = 'auto';
		}
	}

	/** Generic sound player */
	function playSound( soundKey ) {
		if ( sounds[soundKey] ) {
			sounds[soundKey].currentTime = 0;
			sounds[soundKey].play().catch(e => console.error("Sound play failed:", e));
		} else {
			console.warn("Sound not found:", soundKey);
		}
	}

	/** Update Score/Lives display */
	function updateGameUI() {
		$('#game-score').text(gameState.score);
		$('#game-lives').text(gameState.lives);
	}

	// --- Aggregate Chart ---

	/** Initialize the aggregate chart */
	function initializeAggregateChart() { // Renamed function
		var ctx = document.getElementById('aggregateDestructionChart'); // Updated ID
		if (!ctx) {
			console.error("Canvas element #aggregateDestructionChart not found.");
			return;
		}
		ctx = ctx.getContext('2d');

		gameState.aggregateChart = new Chart(ctx, { // Renamed variable
			type: 'bar', // Changed type to bar
			data: {
				labels: ['Sunflowers Destroyed', 'Tulips Destroyed', 'Player Deaths'], // Updated labels
				datasets: [{
					label: 'Total Count',
					data: [
						gameState.totalSunflowersDestroyed,
						gameState.totalTulipsDestroyed,
						gameState.totalPlayerDeaths
					],
					backgroundColor: [
						'rgba(255, 206, 86, 0.7)', // Sunflower Yellow
						'rgba(255, 99, 132, 0.7)',  // Tulip Pink/Red
						'rgba(100, 100, 100, 0.7)'  // Player Deaths Grey
					],
					borderColor: [
						'rgba(255, 206, 86, 1)',
						'rgba(255, 99, 132, 1)',
						'rgba(100, 100, 100, 1)'
					],
					borderWidth: 1
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				indexAxis: 'y', // Optional: makes bars horizontal for better label reading
				scales: {
					x: { // Changed from y
						beginAtZero: true,
						title: {
							display: true,
							text: 'Total Count'
						},
						ticks: {
							stepSize: 1
						}
					},
					y: { // Changed from x
						// No time scale needed
					}
				},
				plugins: {
					legend: {
						display: false // Legend might be redundant with axis labels
					}
				}
			}
		});
	}

	/** Update aggregate chart data */
	function updateAggregateChart() { // New function
		if (gameState.aggregateChart) {
			gameState.aggregateChart.data.datasets[0].data = [
				gameState.totalSunflowersDestroyed,
				gameState.totalTulipsDestroyed,
				gameState.totalPlayerDeaths
			];
			gameState.aggregateChart.update();
		}
	}

	/** Create Player */
	function createPlayer() {
		var playerElement = $('<div>').addClass('player');
		gameState.gameArea.append(playerElement);
		var startX = gameState.gameArea.width() / 2;
		var startY = gameState.gameArea.height() / 2;

		gameState.player = {
			element: playerElement,
			x: startX,
			y: startY,
			vx: 0,
			vy: 0,
			angle: -90, // Pointing up
			invincibilityFrames: config.playerRespawnInvincibility,
			radius: 10 // Collision radius
		};
		positionElement(gameState.player);
	}

	/** Position an element based on game coordinates */
	function positionElement(obj) {
		// Center the element visually based on its dimensions if needed
		var displayX = obj.x - (obj.element.width() / 2);
		var displayY = obj.y - (obj.element.height() / 2); // Adjust based on element shape/origin

		obj.element.css({
			left: displayX + 'px',
			top: displayY + 'px',
			transform: 'rotate(' + obj.angle + 'deg)'
		});

		// Handle player invincibility flashing
		if (obj === gameState.player && obj.invincibilityFrames > 0) {
			obj.element.css('opacity', (obj.invincibilityFrames % 20 < 10) ? 0.5 : 1);
			obj.invincibilityFrames--;
		} else if (obj === gameState.player) {
			obj.element.css('opacity', 1); // Ensure visible when not invincible
		}
	}

	/** Handle Keyboard Input */
	function setupInputHandlers() {
		$(document).on('keydown', function (e) {
			gameState.keys[e.key] = true;
			// Prevent default browser scroll on arrow keys/space
			if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
				e.preventDefault();
			}
		});
		$(document).on('keyup', function (e) {
			gameState.keys[e.key] = false;
		});
	}

	/** Update Player Position and Angle */
	function updatePlayer() {
		if (!gameState.player) return;

		// Rotation
		if (gameState.keys['ArrowLeft']) {
			gameState.player.angle -= config.playerTurnSpeed;
		}
		if (gameState.keys['ArrowRight']) {
			gameState.player.angle += config.playerTurnSpeed;
		}

		// Thrust
		if (gameState.keys['ArrowUp']) {
			var rad = gameState.player.angle * Math.PI / 180;
			gameState.player.vx += Math.cos(rad) * config.playerThrust;
			gameState.player.vy += Math.sin(rad) * config.playerThrust;
			// TODO: Add thrust sound/visual effect
		}

		// Limit speed
		var speed = Math.sqrt(gameState.player.vx * gameState.player.vx + gameState.player.vy * gameState.player.vy);
		if (speed > config.playerMaxSpeed) {
			gameState.player.vx *= config.playerMaxSpeed / speed;
			gameState.player.vy *= config.playerMaxSpeed / speed;
		}

		// Apply drag/friction
		gameState.player.vx *= config.playerDrag;
		gameState.player.vy *= config.playerDrag;

		// Update position
		gameState.player.x += gameState.player.vx;
		gameState.player.y += gameState.player.vy;

		// Screen Wrap
		wrapPosition(gameState.player, gameState.player.radius);

		// Position the element
		positionElement(gameState.player);

		// Shooting
		if (gameState.keys[' '] || gameState.keys['Spacebar']) { // Space key
			shootBullet();
		}
	}

	/** Shoot Bullet */
	function shootBullet() {
		var now = Date.now();
		if (!gameState.player || now - gameState.lastShotTime < config.shotDelay) {
			return;
		}
		gameState.lastShotTime = now;
		playSound('shoot');

		var rad = gameState.player.angle * Math.PI / 180;
		var bulletX = gameState.player.x + Math.cos(rad) * 15; // Start slightly ahead
		var bulletY = gameState.player.y + Math.sin(rad) * 15;
		var bulletVX = gameState.player.vx + Math.cos(rad) * config.bulletSpeed;
		var bulletVY = gameState.player.vy + Math.sin(rad) * config.bulletSpeed;

		var bulletElement = $('<div>').addClass('bullet');
		gameState.gameArea.append(bulletElement);

		var bullet = {
			element: bulletElement,
			x: bulletX,
			y: bulletY,
			vx: bulletVX,
			vy: bulletVY,
			lifetime: config.bulletLifetime,
			radius: 3
		};
		gameState.bullets.push(bullet);
		positionElement(bullet); // Initial position
	}

	/** Update Bullets */
	function updateBullets() {
		for (var i = gameState.bullets.length - 1; i >= 0; i--) {
			var bullet = gameState.bullets[i];
			bullet.x += bullet.vx;
			bullet.y += bullet.vy;
			bullet.lifetime--;

			// Position element (no rotation needed)
			bullet.element.css({ left: (bullet.x - bullet.radius) + 'px', top: (bullet.y - bullet.radius) + 'px' });

			// Remove if lifetime expires or off-screen (optional, wrap could also work)
			if (bullet.lifetime <= 0 || isOffscreen(bullet)) {
				bullet.element.remove();
				gameState.bullets.splice(i, 1);
			} else {
				wrapPosition(bullet, bullet.radius); // Wrap bullets around screen
			}
		}
	}

	/** Screen Wrapping */
	function wrapPosition(obj, buffer = 0) {
		var width = gameState.gameArea.width();
		var height = gameState.gameArea.height();
		if (obj.x < -buffer) obj.x = width + buffer;
		if (obj.x > width + buffer) obj.x = -buffer;
		if (obj.y < -buffer) obj.y = height + buffer;
		if (obj.y > height + buffer) obj.y = -buffer;
	}

	/** Check if object is way off screen */
	function isOffscreen(obj, margin = 50) {
		var width = gameState.gameArea.width();
		var height = gameState.gameArea.height();
		return obj.x < -margin || obj.x > width + margin || obj.y < -margin || obj.y > height + margin;
	}

	/** Spawn Flower (Asteroid) */
	function spawnFlower(eventData = {}) {
		if (gameState.asteroids.length >= config.maxAsteroids) return;

		var size = Math.floor( Math.random() * 40 ) + 30; // 30-70px
		var spawnEdge = Math.floor(Math.random() * 4);
		var width = gameState.gameArea.width();
		var height = gameState.gameArea.height();
		var x, y;

		// Determine spawn position (off-screen)
		if (spawnEdge === 0) { // Top
			x = Math.random() * width; y = -size;
		} else if (spawnEdge === 1) { // Right
			x = width + size; y = Math.random() * height;
		} else if (spawnEdge === 2) { // Bottom
			x = Math.random() * width; y = height + size;
		} else { // Left
			x = -size; y = Math.random() * height;
		}

		// Determine velocity towards center (with variance)
		var angleToCenter = Math.atan2((height / 2) - y, (width / 2) - x);
		var angleVariance = (Math.random() - 0.5) * Math.PI * 0.6; // +/- variance
		var finalAngle = angleToCenter + angleVariance;
		var speed = config.asteroidBaseSpeed + Math.random() * config.asteroidSpeedVariance;
		var vx = Math.cos(finalAngle) * speed;
		var vy = Math.sin(finalAngle) * speed;

		// Determine type (reuse existing logic)
		var flowerType = Math.random() < 0.5 ? 'sunflower' : 'tulip';
		var flowerClass = 'examples-' + flowerType;
		if ( flowerType === 'tulip' ) {
			// Ensure config.tulipColors exists before accessing length
			if (config.tulipColors && config.tulipColors.length > 0) {
				var colorIndex = Math.floor( Math.random() * config.tulipColors.length );
				flowerClass += ' tulip-' + config.tulipColors[ colorIndex ];
			} else {
				// Fallback if colors are missing for some reason
				console.warn("Tulip colors missing in config.");
			}
		}

		var flowerElement = $( '<div>' )
			.addClass( flowerClass )
			.css( {
				width: size + 'px',
				height: size + 'px'
			} );
		gameState.gameArea.append(flowerElement);

		var asteroid = {
			id: gameState.asteroidIdCounter++,
			element: flowerElement,
			type: flowerType,
			size: size, // Use for collision radius and maybe health?
			x: x,
			y: y,
			vx: vx,
			vy: vy,
			angle: Math.random() * 360, // Visual rotation
			rotationSpeed: (Math.random() - 0.5) * 2, // degrees per frame
			metadata: eventData // Store event data (title, user, etc.)
		};
		gameState.asteroids.push(asteroid);
		positionElement(asteroid); // Initial position
	}

	/** Update Asteroids */
	function updateAsteroids() {
		for (var i = gameState.asteroids.length - 1; i >= 0; i--) {
			var asteroid = gameState.asteroids[i];
			asteroid.x += asteroid.vx;
			asteroid.y += asteroid.vy;
			asteroid.angle += asteroid.rotationSpeed;

			wrapPosition(asteroid, asteroid.size / 2);
			positionElement(asteroid);
		}
	}

	// --- Powerups ---

	/** Spawn a powerup */
	function spawnPowerup(type) {
		playSound('powerupSpawn');

		var size = 25; // Size of heart
		var spawnEdge = Math.floor(Math.random() * 4);
		var width = gameState.gameArea.width();
		var height = gameState.gameArea.height();
		var x, y;

		// Determine spawn position (off-screen) - similar to asteroids
		if (spawnEdge === 0) { x = Math.random() * width; y = -size; }
		else if (spawnEdge === 1) { x = width + size; y = Math.random() * height; }
		else if (spawnEdge === 2) { x = Math.random() * width; y = height + size; }
		else { x = -size; y = Math.random() * height; }

		// Simple drift towards center or random direction
		var angle = Math.atan2((height / 2) - y, (width / 2) - x) + (Math.random() - 0.5);
		var vx = Math.cos(angle) * config.powerupSpeed;
		var vy = Math.sin(angle) * config.powerupSpeed;

		var powerupElement = $('<div>').addClass('powerup-' + type); // e.g., 'powerup-heart'
		gameState.gameArea.append(powerupElement);

		var powerup = {
			id: gameState.powerupIdCounter++,
			element: powerupElement,
			type: type,
			x: x,
			y: y,
			vx: vx,
			vy: vy,
			radius: size / 2 // Collision radius
		};
		gameState.powerups.push(powerup);
		// Position element (no rotation needed for heart)
		powerup.element.css({ left: (powerup.x - powerup.radius) + 'px', top: (powerup.y - powerup.radius) + 'px' });
	}

	/** Update Powerups */
	function updatePowerups() {
		for (var i = gameState.powerups.length - 1; i >= 0; i--) {
			var powerup = gameState.powerups[i];
			powerup.x += powerup.vx;
			powerup.y += powerup.vy;

			// Position element
			powerup.element.css({ left: (powerup.x - powerup.radius) + 'px', top: (powerup.y - powerup.radius) + 'px' });

			// Remove if off-screen (optional, wrap could also work)
			if (isOffscreen(powerup, 100)) { // Larger margin for removal
				powerup.element.remove();
				gameState.powerups.splice(i, 1);
			} else {
				wrapPosition(powerup, powerup.radius); // Wrap powerups
			}
		}
	}

	/** Check Collisions */
	function checkCollisions() {
		// Bullets vs Asteroids
		for (var i = gameState.bullets.length - 1; i >= 0; i--) {
			var bullet = gameState.bullets[i];
			if (!bullet) continue; // Add check in case bullet was removed mid-loop
			for (var j = gameState.asteroids.length - 1; j >= 0; j--) {
				var asteroid = gameState.asteroids[j];
				if (!asteroid) continue; // Add check
				// ... distance check ...
				var dx = asteroid.x - bullet.x;
				var dy = asteroid.y - bullet.y;
				var dist = Math.sqrt(dx * dx + dy * dy);
				var collisionDist = (asteroid.size / 2) + bullet.radius;

				if (dist < collisionDist) {
					// Hit!
					bullet.element.remove();
					gameState.bullets.splice(i, 1);

					// Award points based on type (using updated config.points)
					var pointsAwarded = config.points[asteroid.type] || 0;
					gameState.score += pointsAwarded;

					// Check for powerup spawn *before* destroying asteroid data
					if (gameState.score >= gameState.nextPowerupScore) {
						spawnPowerup('heart'); // Spawn a heart
						gameState.nextPowerupScore += config.powerupSpawnScoreInterval; // Set next threshold
					}

					destroyAsteroid(j); // Handle asteroid destruction (increments counter)
					updateGameUI();
					// updateAggregateChart(); // Called within destroyAsteroid

					break; // Bullet hits one asteroid
				}
			}
		}

		// Player vs Asteroids
		if (gameState.player && gameState.player.invincibilityFrames <= 0) {
			for (var k = gameState.asteroids.length - 1; k >= 0; k--) {
				var asteroid = gameState.asteroids[k];
				if (!asteroid) continue; // Add check
				// ... distance check ...
				var dx = asteroid.x - gameState.player.x;
				var dy = asteroid.y - gameState.player.y;
				var dist = Math.sqrt(dx * dx + dy * dy);
				var collisionDist = (asteroid.size / 2) + gameState.player.radius;

				if (dist < collisionDist) {
					// Player Hit!
					playSound('playerHit');
					// No points for crashing into asteroid
					destroyAsteroid(k); // Destroy the asteroid (increments flower counter)

					gameState.lives--;
					gameState.totalPlayerDeaths++; // Increment aggregate player death counter
					updateGameUI();
					updateAggregateChart(); // Update chart after player death

					if (gameState.lives <= 0) {
						gameOver();
					} else {
						// Respawn player
						// ... respawn logic ...
						gameState.player.x = gameState.gameArea.width() / 2;
						gameState.player.y = gameState.gameArea.height() / 2;
						gameState.player.vx = 0;
						gameState.player.vy = 0;
						gameState.player.invincibilityFrames = config.playerRespawnInvincibility;
					}
					break; // Player hit one asteroid
				}
			}
		}

		// Player vs Powerups
		if (gameState.player) {
			for (var p = gameState.powerups.length - 1; p >= 0; p--) {
				var powerup = gameState.powerups[p];
				if (!powerup) continue;

				var dx = powerup.x - gameState.player.x;
				var dy = powerup.y - gameState.player.y;
				var dist = Math.sqrt(dx * dx + dy * dy);
				var collisionDist = powerup.radius + gameState.player.radius;

				if (dist < collisionDist) {
					// Player collected powerup!
					if (powerup.type === 'heart') {
						gameState.lives++;
						playSound('powerupCollect');
						updateGameUI(); // Update lives display
					}
					// Add other powerup types here if needed

					// Remove powerup
					powerup.element.remove();
					gameState.powerups.splice(p, 1);
				}
			}
		}
	}

	/** Destroy Asteroid */
	function destroyAsteroid(index) {
		if (index < 0 || index >= gameState.asteroids.length) return;

		var asteroid = gameState.asteroids[index];

		// Increment specific flower destruction counter
		if (asteroid.type === 'sunflower') {
			gameState.totalSunflowersDestroyed++;
			playSound('sunflowerDestroy');
		} else if (asteroid.type === 'tulip') {
			gameState.totalTulipsDestroyed++;
			playSound('tulipDestroy');
		}
		updateAggregateChart(); // Update chart after flower destruction

		// ... existing explosion creation ...
		createExplosion(asteroid.x, asteroid.y);

		// ... existing removal ...
		asteroid.element.remove();
		gameState.asteroids.splice(index, 1);
	}

	// --- Game Over ---
	function gameOver() {
		if (gameState.gameOver) return; // Prevent multiple calls

		console.log("GAME OVER");
		gameState.gameOver = true;
		playSound('gameOver'); // Play game over sound

		if (gameState.eventSource) {
			gameState.eventSource.close();
			gameState.eventSource = null;
		}
		if (gameState.player) {
			// Optional: create player explosion
			createExplosion(gameState.player.x, gameState.player.y);
			gameState.player.element.remove();
			gameState.player = null;
		}

		// Remove any remaining bullets instantly
		gameState.bullets.forEach(b => b.element.remove());
		gameState.bullets = [];

		// Remove powerups
		gameState.powerups.forEach(p => p.element.remove());
		gameState.powerups = [];

		// Display Game Over Screen
		var gameOverScreen = $('<div>').attr('id', 'game-over-screen')
			.append('<h2>GAME OVER</h2>')
			.append('<p>Final Score: ' + gameState.score + '</p>')
			.append('<button id="restart-button">Restart Game</button>')
			.appendTo(gameState.gameArea); // Append to game area

		// Add click listener for restart button
		$('#restart-button').on('click', restartGame);
	}

	// --- Restart Game ---
	function restartGame() {
		console.log("Restarting game...");

		// Remove game over screen
		$('#game-over-screen').remove();

		// Reset game state variables
		gameState.score = 0;
		gameState.lives = 3;
		gameState.gameOver = false;
		gameState.paused = false;
		gameState.totalSunflowersDestroyed = 0; // Reset specific counter
		gameState.totalTulipsDestroyed = 0; // Reset specific counter
		gameState.totalPlayerDeaths = 0;
		gameState.lastShotTime = 0;
		gameState.nextPowerupScore = config.powerupSpawnScoreInterval; // Reset powerup score threshold

		// Clear existing game objects
		gameState.asteroids.forEach(a => a.element.remove());
		gameState.asteroids = [];
		gameState.bullets.forEach(b => b.element.remove());
		gameState.bullets = [];
		gameState.powerups.forEach(p => p.element.remove()); // Clear powerups
		gameState.powerups = [];
		// Clear any active explosions if tracked separately

		// Reset chart
		updateAggregateChart();

		// Recreate player
		createPlayer();

		// Update UI
		updateGameUI();

		// Reconnect event stream
		connectEventStream();

		// Restart game loop if it was stopped (it wasn't fully stopped, just paused updates)
		if (!gameState.gameLoopId) { // Should not happen if using requestAnimationFrame correctly
			gameState.gameLoopId = requestAnimationFrame(gameLoop);
		}
	}

	// --- Event Stream Handling ---
	function connectEventStream() {
		if (gameState.eventSource) {
			gameState.eventSource.close();
		}
		try {
			gameState.eventSource = new EventSource(config.eventStreamUrl);

			gameState.eventSource.onmessage = function (event) {
				if (gameState.gameOver || gameState.paused) return;
				try {
					var data = JSON.parse(event.data);
					// Filter or process data as needed, e.g., only spawn on 'edit'
					if (data && data.meta && data.type === 'edit') {
						// console.log("RC Event:", data.meta.uri, data.user_text);
						// Spawn an asteroid based on this event
						spawnFlower({
							title: data.title || 'Unknown Page',
							user: data.user_text || 'Unknown User',
							uri: data.meta.uri,
							wiki: data.meta.domain
							// Add other relevant data like change size?
						});
					}
				} catch (e) {
					console.error("Failed to parse event data:", e, event.data);
				}
			};

			gameState.eventSource.onerror = function (err) {
				console.error("EventSource failed:", err);
				// Attempt to reconnect after a delay?
				gameState.eventSource.close();
				setTimeout(connectEventStream, 5000); // Reconnect after 5 seconds
			};

			console.log("Connected to EventStream:", config.eventStreamUrl);

		} catch (e) {
			console.error("Failed to create EventSource:", e);
			// Fallback? Use interval spawning?
			// setTimeout(spawnFlower, config.asteroidSpawnInterval); // Example fallback
		}
	}

	// --- Main Game Loop ---
	function gameLoop() {
		if (gameState.gameOver || gameState.paused) {
			// Still need to request next frame if paused to allow unpausing
			gameState.gameLoopId = requestAnimationFrame(gameLoop);
			return;
		}

		// Clear canvas (if using canvas drawing - not needed if using DOM elements)

		// Update game objects
		updatePlayer();
		updateBullets();
		updateAsteroids();
		updatePowerups(); // Update powerups
		// updateExplosions(); // If using explosion objects

		// Check collisions

		checkCollisions();

		// Draw game objects (positioning is handled in update functions for DOM)

		// Request next frame
		gameState.gameLoopId = requestAnimationFrame(gameLoop);
	}

	// --- Initialization ---
	$( function () {
		gameState.gameArea = $('#mw-content-text'); // Use content area for game
		if (!gameState.gameArea.length) {
			console.error("Game area #mw-content-text not found!");
			return;
		}

		setupSounds();
		setupInputHandlers();
		// createPlayer(); // Player created on game start/restart
		initializeAggregateChart(); // Call renamed function
		updateGameUI();
		updateAggregateChart(); // Initial chart draw (with zeros)

		connectEventStream();

		gameState.gameStarted = true;
		gameState.gameLoopId = requestAnimationFrame(gameLoop);

		// Remove time series interval start
		// gameState.timeSeriesIntervalId = setInterval(updateTimeSeriesData, 1000);

		restartGame(); // Use restartGame for initial setup

		console.log("Game Initialized with Aggregate Chart");
	} );

	// --- Helper Functions (reuse if needed) ---
	// createExplosion, addCloud, createSun (can keep createSun/addCloud)

	/** Create explosion parts */
	function createExplosion( x, y ) {
		var explosionParts = 8; // Reuse config or define locally
		var explosionRadius = 150;
		var explosionPartDuration = 500;

		for ( var i = 0; i < explosionParts; i++ ) {
			var angle = Math.random() * 2 * Math.PI;
			var targetX = x + Math.cos( angle ) * explosionRadius * ( 0.5 + Math.random() * 0.5 );
			var targetY = y + Math.sin( angle ) * explosionRadius * ( 0.5 + Math.random() * 0.5 );

			var part = $( '<div>' )
				.addClass( 'explosion-part' )
				.css( { left: x + 'px', top: y + 'px' } )
				.appendTo( gameState.gameArea ); // Append to game area

			part.animate( {
				left: targetX + 'px',
				top: targetY + 'px',
				opacity: 0
			}, {
				duration: explosionPartDuration,
				easing: 'linear',
				complete: function () { $( this ).remove(); }
			} );
		}
	}

	// Keep sun/cloud logic if desired
	function createSun() { /* ... keep existing ... */ }
	function createCloud() { /* ... keep existing ... */ }
	function addCloud() { /* ... keep existing ... */ }
	// $(function() { createSun(); setTimeout(addCloud, 500); }); // Add back to init if needed

}() );
