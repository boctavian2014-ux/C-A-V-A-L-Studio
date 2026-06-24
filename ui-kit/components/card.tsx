import type { ReactNode } from "react";

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  media?: ReactNode;
  footer?: ReactNode;
  interactive?: boolean;
  children?: ReactNode;
}

export const Card = ({ title, description, media, footer, interactive = false, children }: CardProps) => (
  <article className={`caval-card ${interactive ? "caval-card--interactive" : ""}`.trim()}>
    {media && <div className="caval-card__media">{media}</div>}
    {(title || description) && (
      <header className="caval-card__header">
        {title && <h3>{title}</h3>}
        {description && <p>{description}</p>}
      </header>
    )}
    {children && <div className="caval-card__body">{children}</div>}
    {footer && <footer className="caval-card__footer">{footer}</footer>}
  </article>
);
