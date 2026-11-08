import { motion, type HTMLMotionProps, type Variants } from 'motion/react';
import React, { createContext, useContext } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

interface StaggerContextType {
  reducedMotion: boolean;
  baseDelay: number;
}

const StaggerContext = createContext<StaggerContextType>({
  reducedMotion: false,
  baseDelay: 0,
});

export interface AnimatedTextContainerProps extends HTMLMotionProps<'div'> {
  staggerDelay?: number;
  initialDelay?: number;
  children: React.ReactNode;
}

export function AnimatedTextContainer({
  staggerDelay = 0.08,
  initialDelay = 0.04,
  children,
  className,
  ...rest
}: AnimatedTextContainerProps) {
  const reducedMotion = usePrefersReducedMotion();

  const containerVariants: Variants = reducedMotion
    ? {
        hidden: { opacity: 1 },
        visible: { opacity: 1, transition: { duration: 0 } },
      }
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: initialDelay,
          },
        },
      };

  return (
    <StaggerContext.Provider value={{ reducedMotion, baseDelay: initialDelay }}>
      <motion.div
        data-animated-text-container="true"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className={className}
        {...rest}
      >
        {children}
      </motion.div>
    </StaggerContext.Provider>
  );
}

export interface AnimatedTextItemProps extends HTMLMotionProps<'div'> {
  as?: 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'span' | 'article' | 'section' | 'header';
  delayIndex?: number;
  delayStep?: number;
  children: React.ReactNode;
}

export function AnimatedTextItem({
  as = 'div',
  delayIndex,
  delayStep = 0.08,
  children,
  className,
  ...rest
}: AnimatedTextItemProps) {
  const reducedMotion = usePrefersReducedMotion();
  const Tag = motion[as] as React.ComponentType<any>;

  const variants: Variants = reducedMotion
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: { opacity: 1, y: 0, transition: { duration: 0 } },
      }
    : {
        hidden: { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.42,
            ease: [0.16, 1, 0.3, 1],
            ...(typeof delayIndex === 'number'
              ? { delay: delayIndex * delayStep }
              : {}),
          },
        },
      };

  return (
    <Tag
      data-animated-text="true"
      variants={variants}
      initial="hidden"
      animate="visible"
      className={className}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Returns motion props with `data-animated-text="true"` for custom motion elements.
 */
export function getTextItemMotion(
  reducedMotion: boolean,
  index = 0,
  step = 0.08,
): HTMLMotionProps<any> {
  if (reducedMotion) {
    return {
      'data-animated-text': 'true',
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    'data-animated-text': 'true',
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.42,
      delay: index * step,
      ease: [0.16, 1, 0.3, 1],
    },
  };
}
