const DATA_URL = 'assemblies.json';

class NetworkNode {
    constructor(data, x, y) {
        this.id = data.id;
        this.label = data.title.translation;
        this.childrenCount = data.childrenCount;
        this.parent = data.parent ? data.parent.id : null;
        this.x = x;
        this.y = y;
        this.targetX = 0;
        this.targetY = 0;
        this.isParent = false;
    }

    draw(ctx, nodeRadius) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, nodeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = this.isParent ? '#ff6b6b' : '#4a90e2';
        ctx.fill();

        if (this.childrenCount > 0) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, nodeRadius + 5, 0, 2 * Math.PI);
            ctx.strokeStyle = this.isParent ? '#ff6b6b' : '#4a90e2';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.fillText(
                this.childrenCount.toString(),
                this.x + nodeRadius + 15,
                this.y - nodeRadius - 5
            );
        }

        this.drawLabel(ctx, nodeRadius);
    }

    drawLabel(ctx, nodeRadius) {
        const fontSize = 12;
        const computedStyle = window.getComputedStyle(ctx.canvas);
        
        // Set text rendering properties for better quality
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Set font with proper pixel ratio scaling
        const scaledFontSize = fontSize * window.devicePixelRatio;
        ctx.font = `${fontSize}px ${computedStyle.fontFamily}`;
        ctx.fillStyle = computedStyle.color || '#333';
        
        // Get text lines
        const maxWidth = 150;
        const words = this.label.split(' ');
        let lines = [''];
        let currentLine = 0;
        
        words.forEach(word => {
            const testLine = lines[currentLine] + word + ' ';
            if (ctx.measureText(testLine).width < maxWidth) {
                lines[currentLine] = testLine;
            } else {
                currentLine++;
                lines[currentLine] = word + ' ';
            }
        });

        // Draw each line with proper anti-aliasing
        const lineHeight = fontSize * 1.4;
        lines.forEach((line, index) => {
            const y = this.y + nodeRadius + 10 + (index * lineHeight);
            // Save context before drawing text
            ctx.save();
            // Apply subpixel positioning
            ctx.translate(Math.round(this.x), Math.round(y));
            ctx.fillText(line.trim(), 0, 0);
            // Restore context
            ctx.restore();
        });
    }

    updatePosition(progress) {
        this.x = this.x + (this.targetX - this.x) * progress;
        this.y = this.y + (this.targetY - this.y) * progress;
    }
}

class NetworkVisualization {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.NODE_RADIUS = 20;
        this.ANIMATION_DURATION = 2000;
        
        const computedStyle = window.getComputedStyle(this.canvas);
        this.fontFamily = computedStyle.fontFamily;
        this.textColor = computedStyle.color;
        
        this.allNodes = [];
        this.visibleNodes = [];
        this.currentParent = null;
        this.edges = [];

        this.pixelRatio = Math.max(window.devicePixelRatio || 1, 2);
        
        this.setCanvasSize();
        
        this.setupEventListeners();
        
        this.loadData().then(() => {
            console.log('Datos cargados:', this.allNodes.length, 'nodos');
            this.showNodesForParent(null);
        });

        this.draggedNode = null;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.hasMoved = false;
    }

    setCanvasSize() {
        // Get parent element dimensions
        const parent = this.canvas.parentElement;
        const rect = parent.getBoundingClientRect();
        
        // Set canvas size based on parent
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        
        // Set actual canvas dimensions considering pixel ratio
        this.canvas.width = rect.width * this.pixelRatio;
        this.canvas.height = rect.height * this.pixelRatio;

        // Scale context
        this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

        // Configure context
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.textBaseline = 'middle';
        this.ctx.textRendering = 'optimizeLegibility';
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.setCanvasSize();
            if (this.visibleNodes.length > 0) {
                this.layoutNodes();
                this.draw();
            }
        });
        
        this.canvas.addEventListener('click', (e) => {
            if (this.hasMoved) {
                return;
            }

            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Check back button click
            if (this.currentParent !== null && 
                this.isClickInCircle(x, y, 50, 50, 25)) {
                const currentNode = this.allNodes.find(n => n.id === this.currentParent);
                this.showNodesForParent(currentNode?.parent || null);
                return;
            }

            const clickedNode = this.visibleNodes.find(node => 
                this.isClickInCircle(x, y, node.x, node.y, this.NODE_RADIUS)
            );

            if (clickedNode && clickedNode.childrenCount > 0) {
                this.showNodesForParent(clickedNode.id);
            }
        });

        // Add mouse events for dragging
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Check if clicked on a node
            const clickedNode = this.visibleNodes.find(node => 
                this.isClickInCircle(x, y, node.x, node.y, this.NODE_RADIUS)
            );

            if (clickedNode) {
                this.isDragging = true;
                this.draggedNode = clickedNode;
                this.dragStartX = x - clickedNode.x;
                this.dragStartY = y - clickedNode.y;
                this.hasMoved = false;
                this.canvas.style.cursor = 'grabbing';
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging && this.draggedNode) {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Update node position
                this.draggedNode.x = x - this.dragStartX;
                this.draggedNode.y = y - this.dragStartY;
                
                // Update target position as well
                this.draggedNode.targetX = this.draggedNode.x;
                this.draggedNode.targetY = this.draggedNode.y;

                this.hasMoved = true;
                this.draw();
            }
        });

        // Add hover effect
      //   this.canvas.addEventListener('mousemove', (e) => {
      //     const rect = this.canvas.getBoundingClientRect();
      //     const x = e.clientX - rect.left;
      //     const y = e.clientY - rect.top;

      //     const hoveredNode = this.visibleNodes.find(node => 
      //         this.isClickInCircle(x, y, node.x, node.y, this.NODE_RADIUS)
      //     );

      //     if (hoveredNode) {
      //         this.canvas.style.cursor = this.isDragging ? 'grabbing' : 'grab';
      //     } else {
      //         if (!this.isDragging) {
      //             this.canvas.style.cursor = 'default';
      //         }
      //     }
      // });

        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.draggedNode = null;
            this.canvas.style.cursor = 'default';
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.draggedNode = null;
            this.canvas.style.cursor = 'default';
        });

        
    }

    async loadData() {
        try {
            const response = await fetch(DATA_URL);
            const data = await response.json();
            
            // Create root node
            const rootNode = new NetworkNode({
                id: 'root',
                title: { translation: 'Asambleas de Barcelona' },
                childrenCount: data.data.assemblies.filter(a => !a.parent).length,
                parent: null
            }, this.canvas.width/2, this.canvas.height/2);

            // Create rest of nodes
            const otherNodes = data.data.assemblies.map(assembly => new NetworkNode(
                assembly,
                this.canvas.width/2,
                this.canvas.height/2
            ));

            this.allNodes = [rootNode, ...otherNodes];

            // Show root view initially
            this.showNodesForParent(null);
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showErrorMessage();
        }
    }

    showNodesForParent(parentId) {
        console.log('Mostrando nodos para padre:', parentId);
        this.currentParent = parentId;
        
        if (parentId === null) {
            // Vista inicial: mostrar nodo raíz y nodos de primer nivel
            const rootNode = this.allNodes.find(n => n.id === 'root');
            const firstLevelNodes = this.allNodes.filter(node => !node.parent);
            this.visibleNodes = [rootNode, ...firstLevelNodes];
            this.edges = firstLevelNodes.map(node => ({
                from: 'root',
                to: node.id
            }));
        } else {
            // Encontrar el nodo actual y construir la cadena hasta el root
            const currentNode = this.allNodes.find(node => node.id === parentId);
            const childNodes = this.allNodes.filter(node => node.parent === parentId);
            const rootNode = this.allNodes.find(n => n.id === 'root');
            
            // Construir la cadena de nodos padres
            const parentChain = [];
            let currentParent = currentNode;
            while (currentParent && currentParent.parent) {
                const parentNode = this.allNodes.find(n => n.id === currentParent.parent);
                if (parentNode) {
                    parentChain.unshift(parentNode);
                    currentParent = parentNode;
                } else {
                    break;
                }
            }

            // Marcar el nodo actual como padre
            currentNode.isParent = true;
            // Desmarcar otros nodos como padres
            parentChain.forEach(node => node.isParent = false);

            // Combinar todos los nodos visibles
            this.visibleNodes = [
                rootNode,
                ...parentChain,
                currentNode,
                ...childNodes
            ];
            
            // Crear todas las conexiones
            this.edges = [
                // Conexión desde root al primer nivel
                {
                    from: 'root',
                    to: parentChain[0]?.id || parentId
                },
                // Conexiones entre nodos padres
                ...parentChain.slice(0, -1).map((node, index) => ({
                    from: node.id,
                    to: parentChain[index + 1].id
                })),
                // Conexión al nodo actual si hay cadena de padres
                ...(parentChain.length > 0 ? [{
                    from: parentChain[parentChain.length - 1].id,
                    to: parentId
                }] : []),
                // Conexiones a los hijos
                ...childNodes.map(child => ({
                    from: parentId,
                    to: child.id
                }))
            ];
        }

        // Posicionar nodos y animar
        this.layoutNodes();
        this.animateNodes();
    }

    animateNodes() {
        const startTime = performance.now();
        const duration = 400; // duración de la animación en ms

        // Guardar posiciones iniciales
        const startPositions = this.visibleNodes.map(node => ({
            id: node.id,
            x: node.x,
            y: node.y
        }));

        // Guardar posiciones finales (targetX/Y ya están establecidas por layoutNodes)
        const endPositions = this.visibleNodes.map(node => ({
            id: node.id,
            x: node.targetX,
            y: node.targetY
        }));

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Función de easing para suavizar el movimiento
            const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic

            // Actualizar posiciones
            this.visibleNodes.forEach(node => {
                const start = startPositions.find(p => p.id === node.id);
                const end = endPositions.find(p => p.id === node.id);
                
                node.x = start.x + (end.x - start.x) * easeProgress;
                node.y = start.y + (end.y - start.y) * easeProgress;
            });

            // Dibujar
            this.draw();

            // Continuar animación si no ha terminado
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    handleBackButton() {
        if (this.currentParent !== null) {
            // Find current node and get its parent
            const currentNode = this.allNodes.find(n => n.id === this.currentParent);
            // Go to parent (or root if no parent)
            this.showNodesForParent(currentNode?.parent || null);
        }
    }

    layoutNodes() {
        const displayWidth = this.canvas.width / this.pixelRatio;
        const displayHeight = this.canvas.height / this.pixelRatio;
        
        if (this.currentParent !== null) {
            // Vista de hijos: root en esquina superior derecha, padre en centro, hijos alrededor
            const rootNode = this.visibleNodes.find(n => n.id === 'root');
            const parentNode = this.visibleNodes.find(n => n.id === this.currentParent);
            const childNodes = this.visibleNodes.filter(n => n.id !== 'root' && n.id !== this.currentParent);
            
            // Posicionar root en esquina superior derecha
            rootNode.targetX = displayWidth * 0.85;
            rootNode.targetY = displayHeight * 0.15;
            
            // Posicionar padre en el centro
            parentNode.targetX = displayWidth / 2;
            parentNode.targetY = displayHeight / 2;

            // Distribuir hijos en círculo alrededor del padre
            const radius = Math.min(displayWidth, displayHeight) / 4;
            childNodes.forEach((node, index) => {
                const angle = (index / childNodes.length) * 2 * Math.PI;
                node.targetX = displayWidth/2 + radius * Math.cos(angle);
                node.targetY = displayHeight/2 + radius * Math.sin(angle);
            });
        } else {
            // Vista inicial: root en centro, otros nodos alrededor
            const rootNode = this.visibleNodes.find(n => n.id === 'root');
            const otherNodes = this.visibleNodes.filter(n => n.id !== 'root');
            
            rootNode.targetX = displayWidth / 2;
            rootNode.targetY = displayHeight / 2;

            const radius = Math.min(displayWidth, displayHeight) / 3;
            otherNodes.forEach((node, index) => {
                const angle = (index / otherNodes.length) * 2 * Math.PI;
                node.targetX = displayWidth/2 + radius * Math.cos(angle);
                node.targetY = displayHeight/2 + radius * Math.sin(angle);
                node.isParent = false;
            });
        }
    }

    draw() {
        const displayWidth = this.canvas.width / this.pixelRatio;
        const displayHeight = this.canvas.height / this.pixelRatio;
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, displayWidth, displayHeight);

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.textBaseline = 'middle';
        this.ctx.lineWidth = 1;

        this.edges.forEach(edge => {
            const fromNode = this.visibleNodes.find(n => n.id === edge.from);
            const toNode = this.visibleNodes.find(n => n.id === edge.to);
            
            if (fromNode && toNode) {
                this.ctx.beginPath();
                this.ctx.moveTo(fromNode.x, fromNode.y);
                this.ctx.lineTo(toNode.x, toNode.y);
                this.ctx.strokeStyle = '#aaa';
                this.ctx.stroke();
            }
        });

        this.visibleNodes.forEach(node => {
            if (node.id === 'root') {
                this.ctx.beginPath();
                this.ctx.arc(node.x, node.y, this.NODE_RADIUS * 1.5, 0, 2 * Math.PI);
                this.ctx.fillStyle = '#ff9f43';
                this.ctx.fill();
                
                this.ctx.font = `${14}px ${window.getComputedStyle(this.canvas).fontFamily}`;
                this.ctx.fillStyle = '#333';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(node.label, node.x, node.y);
            } else {
                node.draw(this.ctx, this.NODE_RADIUS);
            }
        });

        if (this.currentParent !== null) {
            this.drawBackButton();
        }
    }

    showErrorMessage() {
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillText('Error cargando datos', this.canvas.width/2, this.canvas.height/2);
    }

    isClickInCircle(clickX, clickY, circleX, circleY, radius) {
        const dx = clickX - circleX;
        const dy = clickY - circleY;
        return dx * dx + dy * dy <= radius * radius;
    }

    drawBackButton() {
        // Position the button in the top-left corner with some padding
        const buttonX = 50;
        const buttonY = 50;
        const buttonRadius = 25;

        // Draw the circular button background
        this.ctx.beginPath();
        this.ctx.arc(buttonX, buttonY, buttonRadius, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#4a90e2';
        this.ctx.fill();

        // Draw the back arrow icon
        this.ctx.beginPath();
        this.ctx.moveTo(buttonX + 8, buttonY); // Start at right side
        this.ctx.lineTo(buttonX - 8, buttonY); // Draw horizontal line left
        this.ctx.lineTo(buttonX - 8, buttonY - 8); // Draw vertical line up
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // Reset line width to default
        this.ctx.lineWidth = 1;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new NetworkVisualization('networkCanvas');
});
