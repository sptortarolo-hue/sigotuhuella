import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import { PawPrint, Loader2, Heart, MessageCircle, Trash2, Sparkles, Send } from 'lucide-react';

export default function Feed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [commentLoading, setCommentLoading] = useState<Record<string, boolean>>({});

  const fetchPosts = useCallback(async (p: number) => {
    try {
      setLoading(true);
      const res = await api.feed.list(p);
      if (p === 1) setPosts(res.posts);
      else setPosts(prev => [...prev, ...res.posts]);
      setHasMore(res.hasMore);
      setPage(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(1); }, []);

  const handleLike = async (postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    try {
      if (post.user_liked) {
        const res = await api.feed.unlike(postId);
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, user_liked: false, like_count: res.count } : p));
      } else {
        const res = await api.feed.like(postId);
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, user_liked: true, like_count: res.count } : p));
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (postId: string) => {
    try {
      await api.feed.delete(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (e) { console.error(e); }
  };

  const toggleComments = async (postId: string) => {
    const willOpen = !openComments[postId];
    setOpenComments(prev => ({ ...prev, [postId]: willOpen }));
    if (willOpen && !comments[postId]) {
      try {
        const res = await api.feed.comments.list(postId);
        setComments(prev => ({ ...prev, [postId]: res }));
      } catch (e) { console.error(e); }
    }
  };

  const submitComment = async (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;
    setCommentLoading(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await api.feed.comments.create(postId, text);
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), res] }));
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
    } catch (e) { console.error(e); }
    finally { setCommentLoading(prev => ({ ...prev, [postId]: false })); }
  };

  const speciesEmoji = (s: string) => s === 'dog' ? '🐶' : s === 'cat' ? '🐱' : '🐾';

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary flex items-center gap-2">
              <Sparkles className="w-6 h-6" /> Comunidad
            </h1>
            <p className="text-sm text-gray-500 mt-1">Milestones de las mascotas</p>
          </div>
          <Link to="/" className="text-xs text-brand-primary hover:underline">Inicio</Link>
        </div>

        {!user && (
          <div className="p-4 bg-white rounded-2xl border border-brand-accent mb-6 text-center">
            <p className="text-sm text-gray-500 mb-3">Iniciá sesión para ver el feed de la comunidad</p>
            <Link to="/login" className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold inline-block hover:shadow-lg transition-all">
              Iniciar sesión
            </Link>
          </div>
        )}

        {posts.length === 0 && !loading && (
          <div className="text-center py-20">
            <PawPrint className="w-16 h-16 text-brand-primary/20 mx-auto mb-4" />
            <p className="text-gray-400">Todavía no hay publicaciones</p>
          </div>
        )}

        <div className="space-y-4">
          {posts.map(post => (
            <div key={post.id} className="bg-white rounded-2xl border border-brand-accent overflow-hidden shadow-sm">
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <Link to={`/mascota/${post.my_pet_id}`} className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-brand-primary/10 shrink-0 flex items-center justify-center">
                      {post.has_avatar ? (
                        <img src={`/my-pet-avatar/${post.my_pet_id}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <PawPrint className="w-5 h-5 text-brand-primary/40" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800 group-hover:text-brand-primary transition-colors">
                        {speciesEmoji(post.species)} {post.pet_name}
                      </p>
                      <p className="text-[10px] text-gray-400">{post.user_name}</p>
                    </div>
                  </Link>
                  {user?.id === post.user_id && (
                    <button onClick={() => handleDelete(post.id)} className="p-2 text-gray-300 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <h3 className="text-base font-bold text-gray-800 mb-1">{post.title}</h3>
                {post.description && (
                  <p className="text-sm text-gray-600 mb-3">{post.description}</p>
                )}

                {post.photo_ids?.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {post.photo_ids.slice(0, 4).map((pid: string, idx: number) => (
                      <div key={idx} className="aspect-square rounded-xl overflow-hidden bg-brand-bg">
                        <img src={`/my-pet-photo/${pid}`} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 pt-2 border-t border-brand-accent/50">
                  <button onClick={() => handleLike(post.id)} className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${post.user_liked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}>
                    <Heart className={`w-4 h-4 ${post.user_liked ? 'fill-current' : ''}`} />
                    {post.like_count || 0}
                  </button>
                  <button onClick={() => toggleComments(post.id)} className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${openComments[post.id] ? 'text-brand-primary' : 'text-gray-400 hover:text-brand-primary'}`}>
                    <MessageCircle className="w-4 h-4" />
                    {comments[post.id]?.length || 0}
                  </button>
                  <span className="text-[10px] text-gray-400">
                    {new Date(post.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {openComments[post.id] && (
                <div className="border-t border-brand-accent/50 bg-brand-bg/50 px-4 sm:px-5 py-3">
                  {comments[post.id]?.length > 0 && (
                    <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                      {comments[post.id].map((c: any) => (
                        <div key={c.id} className="flex items-start gap-2">
                          <div className="w-6 h-6 rounded-full bg-brand-primary/10 flex items-center justify-center text-[10px] font-bold text-brand-primary shrink-0">
                            {c.user_name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs">
                              <span className="font-bold text-gray-700">{c.user_name}</span>
                              <span className="text-gray-500 ml-1">{c.content}</span>
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {new Date(c.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {user?.id === c.user_id && (
                            <button onClick={async () => { try { await api.feed.comments.delete(post.id, c.id); setComments(prev => ({ ...prev, [post.id]: prev[post.id].filter((x: any) => x.id !== c.id) })); } catch {} }}
                              className="text-gray-300 hover:text-red-400 transition-colors shrink-0">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {user && (
                    <div className="flex gap-2">
                      <input
                        value={commentInputs[post.id] || ''}
                        onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && submitComment(post.id)}
                        placeholder="Escribí un comentario..."
                        className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-brand-accent bg-white focus:outline-none focus:border-brand-primary transition-colors"
                      />
                      <button onClick={() => submitComment(post.id)} disabled={commentLoading[post.id] || !commentInputs[post.id]?.trim()}
                        className="p-1.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary/90 transition-colors disabled:opacity-50 shrink-0">
                        {commentLoading[post.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {hasMore && (
          <div className="text-center mt-6">
            <button
              onClick={() => fetchPosts(page + 1)}
              disabled={loading}
              className="px-6 py-2.5 bg-white border border-brand-accent rounded-xl text-sm font-medium text-brand-primary hover:shadow transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Cargar más'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
