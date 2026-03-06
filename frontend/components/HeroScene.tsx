'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function HeroScene() {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;
        const container = mountRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Scene
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        // Primary sphere (globe-like)
        const sphereGeo = new THREE.IcosahedronGeometry(1.8, 5);
        const sphereMat = new THREE.MeshPhongMaterial({
            color: 0x4f46e5,
            wireframe: true,
            opacity: 0.12,
            transparent: true,
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        scene.add(sphere);

        // Inner solid sphere
        const innerGeo = new THREE.SphereGeometry(1.6, 32, 32);
        const innerMat = new THREE.MeshPhongMaterial({
            color: 0xf8f9fc,
            shininess: 80,
            opacity: 0.6,
            transparent: true,
        });
        const innerSphere = new THREE.Mesh(innerGeo, innerMat);
        scene.add(innerSphere);

        // Ring 1
        const ring1Geo = new THREE.TorusGeometry(2.2, 0.02, 16, 100);
        const ring1Mat = new THREE.MeshPhongMaterial({ color: 0x4f46e5, opacity: 0.25, transparent: true });
        const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
        ring1.rotation.x = Math.PI / 4;
        scene.add(ring1);

        // Ring 2
        const ring2Geo = new THREE.TorusGeometry(2.6, 0.015, 16, 100);
        const ring2Mat = new THREE.MeshPhongMaterial({ color: 0x06b6d4, opacity: 0.2, transparent: true });
        const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2.rotation.x = -Math.PI / 3;
        ring2.rotation.y = Math.PI / 6;
        scene.add(ring2);

        // Particles
        const particleCount = 200;
        const particleGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 2.5 + Math.random() * 1.5;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
        }
        particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const particleMat = new THREE.PointsMaterial({ color: 0x4f46e5, size: 0.04, opacity: 0.5, transparent: true });
        const particles = new THREE.Points(particleGeo, particleMat);
        scene.add(particles);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
        scene.add(ambientLight);
        const pointLight = new THREE.PointLight(0x4f46e5, 2, 10);
        pointLight.position.set(3, 3, 3);
        scene.add(pointLight);
        const accentLight = new THREE.PointLight(0x06b6d4, 1.5, 10);
        accentLight.position.set(-3, -2, 2);
        scene.add(accentLight);

        // Mouse tracking
        let mouseX = 0, mouseY = 0;
        const onMouseMove = (e: MouseEvent) => {
            mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
            mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        };
        window.addEventListener('mousemove', onMouseMove);

        // Animation loop
        let animFrame: number;
        const clock = new THREE.Clock();
        const animate = () => {
            animFrame = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            sphere.rotation.y = t * 0.1 + mouseX * 0.3;
            sphere.rotation.x = mouseY * 0.2;
            innerSphere.rotation.y = t * -0.05;
            ring1.rotation.z = t * 0.2;
            ring2.rotation.z = t * -0.15;
            particles.rotation.y = t * 0.05;
            renderer.render(scene, camera);
        };
        animate();

        // Resize
        const handleResize = () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animFrame);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('resize', handleResize);
            container.removeChild(renderer.domElement);
            renderer.dispose();
        };
    }, []);

    return (
        <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
    );
}
