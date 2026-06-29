import React from 'react';

// ... inside your component ...
return (
  <>
    <div>
      <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
      <input
        id="username"
        {...register('username')}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="cooluser123"
      />
      {errors?.username && <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>}
    </div>

    <div>
      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
      <input
        id="email"
        {...register('email')}
        type="email"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="you@example.com"
      />
      {errors?.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
    </div>

    <div>
      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
      <input
        id="password"
        {...register('password')}
        type="password"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="At least 8 characters"
      />
      {errors?.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
    </div>
  </>
);